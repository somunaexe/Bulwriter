// Package donation is a minimal client for Stripe's Checkout Sessions API —
// used by the public "Support Bulwriter" page to accept one-time or
// recurring donations without pulling in the full Stripe SDK. Same
// hand-rolled net/http approach as internal/anthropic and internal/clerkapi.
package donation

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultCheckoutURL = "https://api.stripe.com/v1/checkout/sessions"
const defaultFrontendURL = "https://d1hspb5r4tyd4l.cloudfront.net"

type Client struct {
	secretKey     string
	webhookSecret string
	frontendURL   string
	baseURL       string // overridden by tests; always defaultCheckoutURL in production
	http          *http.Client
}

func NewClient() *Client {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = defaultFrontendURL
	}
	return &Client{
		secretKey:     os.Getenv("STRIPE_SECRET_KEY"),
		webhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		frontendURL:   strings.TrimRight(frontendURL, "/"),
		baseURL:       defaultCheckoutURL,
		http:          &http.Client{Timeout: 20 * time.Second},
	}
}

// Enabled reports whether a Stripe secret key is configured — callers
// should return a clear "not set up" error rather than a confusing one
// when it's not, since STRIPE_SECRET_KEY is opt-in.
func (c *Client) Enabled() bool {
	return c.secretKey != ""
}

const (
	// minAmountCents mirrors Stripe's own practical minimum for a USD
	// charge; maxAmountCents is a sanity ceiling against fat-fingering or
	// a scripted call, not a real limit on what someone could donate.
	minAmountCents = 100
	maxAmountCents = 100_000
)

// CreateCheckoutSession starts a Stripe-hosted Checkout page for a
// donation and returns its URL for the browser to redirect to. interval is
// "" for a one-time payment or "month" for a recurring sponsorship;
// anything else is rejected.
func (c *Client) CreateCheckoutSession(amountCents int, interval string) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("donations aren't configured yet (missing STRIPE_SECRET_KEY)")
	}
	if amountCents < minAmountCents || amountCents > maxAmountCents {
		return "", fmt.Errorf("amount must be between $%d and $%d", minAmountCents/100, maxAmountCents/100)
	}

	productName := "One-time donation to Bulwriter"
	mode := "payment"
	if interval != "" {
		if interval != "month" {
			return "", fmt.Errorf("unsupported interval %q", interval)
		}
		productName = "Monthly Bulwriter sponsorship"
		mode = "subscription"
	}

	form := url.Values{}
	form.Set("mode", mode)
	form.Set("success_url", c.frontendURL+"/donate?status=success")
	form.Set("cancel_url", c.frontendURL+"/donate?status=canceled")
	// Stripe's Managed Payments (automatic tax) is on by default for new
	// accounts and requires a product tax_code on every line item — which
	// dynamic price_data (no pre-created Product) never has. Opt out
	// rather than assign a tax code to a donation, which isn't a taxable
	// sale of goods/services.
	form.Set("managed_payments[enabled]", "false")
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", "usd")
	form.Set("line_items[0][price_data][product_data][name]", productName)
	form.Set("line_items[0][price_data][unit_amount]", strconv.Itoa(amountCents))
	if interval != "" {
		form.Set("line_items[0][price_data][recurring][interval]", interval)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.secretKey, "")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling Stripe: %w", err)
	}
	defer resp.Body.Close()

	var body struct {
		URL   string `json:"url"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("decoding Stripe response: %w", err)
	}
	if body.Error != nil {
		return "", fmt.Errorf("Stripe error: %s", body.Error.Message)
	}
	if resp.StatusCode != http.StatusOK || body.URL == "" {
		return "", fmt.Errorf("Stripe API returned status %d", resp.StatusCode)
	}

	return body.URL, nil
}
