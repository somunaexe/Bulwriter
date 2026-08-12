package donation

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// webhookTolerance mirrors Stripe's own recommended window for rejecting
// a signed payload as a possible replay of an old request.
const webhookTolerance = 5 * time.Minute

// verifyWebhookSignature checks a Stripe-Signature header against the raw
// request body and the endpoint's signing secret, hand-rolled per
// Stripe's documented scheme (see "verify signatures manually" in the
// Stripe docs) rather than pulling in the SDK for one HMAC check.
func verifyWebhookSignature(payload []byte, sigHeader, secret string, now time.Time) error {
	if secret == "" {
		return fmt.Errorf("webhook signature verification isn't configured (missing STRIPE_WEBHOOK_SECRET)")
	}

	var timestamp string
	var signatures []string
	for _, part := range strings.Split(sigHeader, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			signatures = append(signatures, kv[1])
		}
	}
	if timestamp == "" || len(signatures) == 0 {
		return fmt.Errorf("malformed Stripe-Signature header")
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid timestamp in Stripe-Signature header")
	}
	age := now.Sub(time.Unix(ts, 0))
	if age < 0 {
		age = -age
	}
	if age > webhookTolerance {
		return fmt.Errorf("timestamp outside tolerance — possible replay")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))

	for _, sig := range signatures {
		if hmac.Equal([]byte(sig), []byte(expected)) {
			return nil
		}
	}
	return fmt.Errorf("signature mismatch")
}

// CompletedCheckout is what ParseCompletedCheckout extracts from a
// checkout.session.completed event — the fields the donations store
// actually needs.
type CompletedCheckout struct {
	SessionID   string
	AmountCents int
	Currency    string
	Interval    string // "" for one-time, "month" for a subscription
}

type webhookEvent struct {
	Type string `json:"type"`
	Data struct {
		Object struct {
			ID            string `json:"id"`
			AmountTotal   int    `json:"amount_total"`
			Currency      string `json:"currency"`
			Mode          string `json:"mode"`
			PaymentStatus string `json:"payment_status"`
		} `json:"object"`
	} `json:"data"`
}

// ParseCompletedCheckout verifies the webhook signature and, if the event
// is a paid checkout.session.completed, returns the details to record.
// A non-matching event (wrong type, or paid-later subscription renewal
// events etc.) returns (nil, nil) — not every event Stripe sends is one
// we act on, and that's not an error.
func (c *Client) ParseCompletedCheckout(payload []byte, sigHeader string) (*CompletedCheckout, error) {
	if err := verifyWebhookSignature(payload, sigHeader, c.webhookSecret, time.Now()); err != nil {
		return nil, err
	}

	var event webhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return nil, fmt.Errorf("decoding webhook event: %w", err)
	}

	if event.Type != "checkout.session.completed" {
		return nil, nil
	}
	obj := event.Data.Object
	if obj.PaymentStatus != "paid" {
		return nil, nil
	}

	interval := ""
	if obj.Mode == "subscription" {
		interval = "month"
	}

	return &CompletedCheckout{
		SessionID:   obj.ID,
		AmountCents: obj.AmountTotal,
		Currency:    obj.Currency,
		Interval:    interval,
	}, nil
}
