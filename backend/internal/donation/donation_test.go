package donation

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &Client{
		secretKey:   "sk_test_123",
		frontendURL: "https://example.com",
		baseURL:     server.URL,
		http:        server.Client(),
	}
}

func TestEnabled(t *testing.T) {
	if (&Client{}).Enabled() {
		t.Fatal("expected a client with no secret key to be disabled")
	}
	if !(&Client{secretKey: "x"}).Enabled() {
		t.Fatal("expected a client with a secret key to be enabled")
	}
}

func TestCreateCheckoutSession_OneTime(t *testing.T) {
	var gotForm url.Values
	var gotUser, gotPass string
	var gotOK bool

	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotUser, gotPass, gotOK = r.BasicAuth()
		r.ParseForm()
		gotForm = r.PostForm
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"url":"https://checkout.stripe.com/session/xyz"}`))
	})

	got, err := c.CreateCheckoutSession(2500, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "https://checkout.stripe.com/session/xyz" {
		t.Errorf("expected the checkout URL to be returned, got %q", got)
	}
	if !gotOK || gotUser != "sk_test_123" || gotPass != "" {
		t.Errorf("expected basic auth with the secret key as username, got user=%q pass=%q ok=%v", gotUser, gotPass, gotOK)
	}
	if gotForm.Get("mode") != "payment" {
		t.Errorf("expected mode=payment for a one-time donation, got %q", gotForm.Get("mode"))
	}
	if gotForm.Get("line_items[0][price_data][unit_amount]") != "2500" {
		t.Errorf("expected unit_amount=2500, got %q", gotForm.Get("line_items[0][price_data][unit_amount]"))
	}
	if gotForm.Get("success_url") != "https://example.com/donate?status=success" {
		t.Errorf("unexpected success_url: %q", gotForm.Get("success_url"))
	}
	if gotForm.Get("managed_payments[enabled]") != "false" {
		t.Errorf("expected managed_payments[enabled]=false (dynamic price_data has no product tax_code), got %q", gotForm.Get("managed_payments[enabled]"))
	}
	if gotForm.Get("line_items[0][price_data][recurring][interval]") != "" {
		t.Error("expected no recurring interval for a one-time donation")
	}
}

func TestCreateCheckoutSession_Monthly(t *testing.T) {
	var gotForm url.Values

	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		gotForm = r.PostForm
		w.Write([]byte(`{"url":"https://checkout.stripe.com/session/abc"}`))
	})

	if _, err := c.CreateCheckoutSession(1000, "month"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotForm.Get("mode") != "subscription" {
		t.Errorf("expected mode=subscription for a monthly sponsorship, got %q", gotForm.Get("mode"))
	}
	if gotForm.Get("line_items[0][price_data][recurring][interval]") != "month" {
		t.Errorf("expected recurring interval=month, got %q", gotForm.Get("line_items[0][price_data][recurring][interval]"))
	}
}

func TestCreateCheckoutSession_Disabled(t *testing.T) {
	c := &Client{} // no secret key
	if _, err := c.CreateCheckoutSession(1000, ""); err == nil {
		t.Fatal("expected an error when no secret key is configured")
	}
}

func TestCreateCheckoutSession_AmountOutOfRange(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not have called Stripe for an out-of-range amount")
	})
	if _, err := c.CreateCheckoutSession(50, ""); err == nil {
		t.Fatal("expected an error for an amount below the minimum")
	}
	if _, err := c.CreateCheckoutSession(200_000, ""); err == nil {
		t.Fatal("expected an error for an amount above the maximum")
	}
}

func TestCreateCheckoutSession_InvalidInterval(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not have called Stripe for an invalid interval")
	})
	if _, err := c.CreateCheckoutSession(1000, "year"); err == nil {
		t.Fatal("expected an error for an unsupported interval")
	}
}

func TestCreateCheckoutSession_ApiError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"invalid API key"}}`))
	})
	_, err := c.CreateCheckoutSession(1000, "")
	if err == nil {
		t.Fatal("expected an error when Stripe returns one")
	}
}
