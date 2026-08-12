package donation

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"testing"
	"time"
)

func sign(secret, timestamp, payload string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func sigHeader(secret string, now time.Time, payload string) string {
	ts := strconv.FormatInt(now.Unix(), 10)
	return "t=" + ts + ",v1=" + sign(secret, ts, payload)
}

func TestVerifyWebhookSignature_Valid(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed"}`
	header := sigHeader("whsec_test", now, payload)

	if err := verifyWebhookSignature([]byte(payload), header, "whsec_test", now); err != nil {
		t.Fatalf("expected a valid signature to verify, got: %v", err)
	}
}

func TestVerifyWebhookSignature_WrongSecret(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed"}`
	header := sigHeader("whsec_test", now, payload)

	if err := verifyWebhookSignature([]byte(payload), header, "whsec_different", now); err == nil {
		t.Fatal("expected a signature made with a different secret to fail")
	}
}

func TestVerifyWebhookSignature_TamperedPayload(t *testing.T) {
	now := time.Now()
	header := sigHeader("whsec_test", now, `{"type":"checkout.session.completed"}`)

	// Verifying against a payload that differs from what was signed —
	// simulates a man-in-the-middle altering the body in transit.
	tampered := `{"type":"checkout.session.completed","amount_total":999999}`
	if err := verifyWebhookSignature([]byte(tampered), header, "whsec_test", now); err == nil {
		t.Fatal("expected a tampered payload to fail signature verification")
	}
}

func TestVerifyWebhookSignature_StaleTimestamp(t *testing.T) {
	old := time.Now().Add(-10 * time.Minute)
	payload := `{"type":"checkout.session.completed"}`
	header := sigHeader("whsec_test", old, payload)

	if err := verifyWebhookSignature([]byte(payload), header, "whsec_test", time.Now()); err == nil {
		t.Fatal("expected a signature older than the tolerance window to be rejected (replay protection)")
	}
}

func TestVerifyWebhookSignature_NoSecretConfigured(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed"}`
	header := sigHeader("whsec_test", now, payload)

	if err := verifyWebhookSignature([]byte(payload), header, "", now); err == nil {
		t.Fatal("expected an error when no webhook secret is configured")
	}
}

func TestVerifyWebhookSignature_MalformedHeader(t *testing.T) {
	if err := verifyWebhookSignature([]byte(`{}`), "not-a-valid-header", "whsec_test", time.Now()); err == nil {
		t.Fatal("expected a malformed Stripe-Signature header to fail")
	}
}

func testClientForWebhook(secret string) *Client {
	return &Client{webhookSecret: secret}
}

func TestParseCompletedCheckout_OneTimePaid(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_1","amount_total":2500,"currency":"usd","mode":"payment","payment_status":"paid"}}}`
	header := sigHeader("whsec_test", now, payload)

	c := testClientForWebhook("whsec_test")
	got, err := c.ParseCompletedCheckout([]byte(payload), header)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatal("expected a non-nil result for a paid checkout.session.completed event")
	}
	want := CompletedCheckout{SessionID: "cs_test_1", AmountCents: 2500, Currency: "usd", Interval: ""}
	if *got != want {
		t.Errorf("got %+v, want %+v", *got, want)
	}
}

func TestParseCompletedCheckout_SubscriptionSetsMonthlyInterval(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_2","amount_total":1000,"currency":"usd","mode":"subscription","payment_status":"paid"}}}`
	header := sigHeader("whsec_test", now, payload)

	c := testClientForWebhook("whsec_test")
	got, err := c.ParseCompletedCheckout([]byte(payload), header)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil || got.Interval != "month" {
		t.Errorf("expected interval=month for a subscription checkout, got %+v", got)
	}
}

func TestParseCompletedCheckout_IgnoresOtherEventTypes(t *testing.T) {
	now := time.Now()
	payload := `{"type":"payment_intent.created","data":{"object":{"id":"pi_test_1"}}}`
	header := sigHeader("whsec_test", now, payload)

	c := testClientForWebhook("whsec_test")
	got, err := c.ParseCompletedCheckout([]byte(payload), header)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for a non-checkout.session.completed event, got %+v", got)
	}
}

func TestParseCompletedCheckout_IgnoresUnpaidSession(t *testing.T) {
	now := time.Now()
	payload := `{"type":"checkout.session.completed","data":{"object":{"id":"cs_test_3","amount_total":500,"currency":"usd","mode":"payment","payment_status":"unpaid"}}}`
	header := sigHeader("whsec_test", now, payload)

	c := testClientForWebhook("whsec_test")
	got, err := c.ParseCompletedCheckout([]byte(payload), header)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for a session whose payment_status isn't 'paid', got %+v", got)
	}
}

func TestParseCompletedCheckout_RejectsBadSignature(t *testing.T) {
	c := testClientForWebhook("whsec_test")
	_, err := c.ParseCompletedCheckout([]byte(`{"type":"checkout.session.completed"}`), "t=1,v1=deadbeef")
	if err == nil {
		t.Fatal("expected an error for an invalid signature")
	}
}
