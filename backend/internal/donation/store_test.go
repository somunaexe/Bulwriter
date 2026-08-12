package donation

import (
	"os"
	"testing"

	"github.com/somunaexe/bulwriter/backend/db"
)

// testStore connects to a real Postgres (DATABASE_URL) and runs the
// actual migrations against it, same as production — no mocking the
// database for store-level logic. Skips locally if DATABASE_URL isn't
// set; backend-ci.yml provides one so this always runs in CI.
func testStore(t *testing.T) *Store {
	t.Helper()
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set — skipping donation store tests (see backend-ci.yml for the CI Postgres service)")
	}

	conn, err := db.Connect()
	if err != nil {
		t.Fatalf("connecting to test database: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	if err := db.Migrate(conn); err != nil {
		t.Fatalf("running migrations: %v", err)
	}

	t.Cleanup(func() {
		conn.Exec(`DELETE FROM donations`)
	})

	return NewStore(conn)
}

func TestRecordCompleted(t *testing.T) {
	s := testStore(t)

	err := s.RecordCompleted(CompletedCheckout{
		SessionID:   "cs_test_store_1",
		AmountCents: 2500,
		Currency:    "usd",
		Interval:    "",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM donations WHERE stripe_session_id = $1`, "cs_test_store_1").Scan(&count); err != nil {
		t.Fatalf("querying: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 row, got %d", count)
	}
}

func TestRecordCompleted_IdempotentOnDuplicateWebhookDelivery(t *testing.T) {
	s := testStore(t)

	c := CompletedCheckout{SessionID: "cs_test_store_dup", AmountCents: 1000, Currency: "usd", Interval: "month"}
	if err := s.RecordCompleted(c); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	// Stripe retries webhook delivery until it gets a 2xx — a second
	// delivery of the same event must not error or double-record.
	if err := s.RecordCompleted(c); err != nil {
		t.Fatalf("duplicate delivery should not error: %v", err)
	}

	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM donations WHERE stripe_session_id = $1`, "cs_test_store_dup").Scan(&count); err != nil {
		t.Fatalf("querying: %v", err)
	}
	if count != 1 {
		t.Errorf("expected exactly 1 row after duplicate webhook delivery, got %d", count)
	}
}
