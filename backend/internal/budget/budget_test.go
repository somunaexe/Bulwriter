package budget

import (
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/somunaexe/bulwriter/backend/db"
)

// testStore connects to a real Postgres (DATABASE_URL) and runs the actual
// migrations against it — same pattern as internal/story's store tests.
// Skips locally if DATABASE_URL isn't set; backend-ci.yml provides one.
func testStore(t *testing.T) *Store {
	t.Helper()
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set — skipping budget store tests (see backend-ci.yml for the CI Postgres service)")
	}

	conn, err := db.Connect()
	if err != nil {
		t.Fatalf("connecting to test database: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	if err := db.Migrate(conn); err != nil {
		t.Fatalf("running migrations: %v", err)
	}

	return NewStore(conn)
}

func TestAddLineItem_LinkedRoundTrips(t *testing.T) {
	s := testStore(t)
	scriptID := uuid.New().String()
	t.Cleanup(func() { s.db.Exec(`DELETE FROM budget_line_items WHERE script_id = $1`, scriptID) })

	linked, err := s.AddLineItem(scriptID, "gun", 250, true)
	if err != nil {
		t.Fatalf("AddLineItem (linked): %v", err)
	}
	if !linked.Linked {
		t.Errorf("expected Linked to be true, got false")
	}

	freeform, err := s.AddLineItem(scriptID, "Insurance", 5000, false)
	if err != nil {
		t.Fatalf("AddLineItem (freeform): %v", err)
	}
	if freeform.Linked {
		t.Errorf("expected Linked to be false, got true")
	}

	items, err := s.ListLineItems(scriptID)
	if err != nil {
		t.Fatalf("ListLineItems: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 line items, got %d", len(items))
	}

	byID := map[string]*LineItem{items[0].ID: items[0], items[1].ID: items[1]}
	if got := byID[linked.ID]; got == nil || !got.Linked {
		t.Errorf("expected the linked item to round-trip Linked=true from ListLineItems")
	}
	if got := byID[freeform.ID]; got == nil || got.Linked {
		t.Errorf("expected the freeform item to round-trip Linked=false from ListLineItems")
	}
}
