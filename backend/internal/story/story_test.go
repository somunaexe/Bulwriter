package story

import (
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/somunaexe/bulwriter/backend/db"
)

// testStore connects to a real Postgres (DATABASE_URL) and runs the actual
// migrations against it — same pattern as internal/donation's store tests.
// Skips locally if DATABASE_URL isn't set; backend-ci.yml provides one.
func testStore(t *testing.T) *Store {
	t.Helper()
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("DATABASE_URL not set — skipping story store tests (see backend-ci.yml for the CI Postgres service)")
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

func TestIdeaNotes_AddUpdateRemove(t *testing.T) {
	s := testStore(t)
	projectID := uuid.New().String()
	t.Cleanup(func() { s.db.Exec(`DELETE FROM story_idea_notes WHERE project_id = $1`, projectID) })

	added, err := s.AddIdeaNote(projectID, "a dream about a lighthouse")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}
	if added.Text != "a dream about a lighthouse" {
		t.Errorf("expected the added note's text to round-trip, got %q", added.Text)
	}

	updated, err := s.UpdateIdeaNote(projectID, added.ID, "a dream about a lighthouse in a storm")
	if err != nil {
		t.Fatalf("UpdateIdeaNote: %v", err)
	}
	if updated.Text != "a dream about a lighthouse in a storm" {
		t.Errorf("expected the updated text, got %q", updated.Text)
	}
	if updated.Position != added.Position {
		t.Errorf("expected position to be preserved across an edit, got %d, want %d", updated.Position, added.Position)
	}

	notes, err := s.ListIdeaNotes(projectID)
	if err != nil {
		t.Fatalf("ListIdeaNotes: %v", err)
	}
	if len(notes) != 1 || notes[0].Text != "a dream about a lighthouse in a storm" {
		t.Errorf("expected the list to reflect the update, got %+v", notes)
	}

	if err := s.RemoveIdeaNote(projectID, added.ID); err != nil {
		t.Fatalf("RemoveIdeaNote: %v", err)
	}
	notes, err = s.ListIdeaNotes(projectID)
	if err != nil {
		t.Fatalf("ListIdeaNotes after remove: %v", err)
	}
	if len(notes) != 0 {
		t.Errorf("expected no notes after removal, got %d", len(notes))
	}
}

func TestUpdateIdeaNote_NotFound(t *testing.T) {
	s := testStore(t)
	projectID := uuid.New().String()

	_, err := s.UpdateIdeaNote(projectID, uuid.New().String(), "text for a note that doesn't exist")
	if err == nil {
		t.Fatal("expected an error when updating a note that doesn't exist")
	}
}

func TestReorderIdeaNotes_SetsPositionsToGivenOrder(t *testing.T) {
	s := testStore(t)
	projectID := uuid.New().String()
	t.Cleanup(func() { s.db.Exec(`DELETE FROM story_idea_notes WHERE project_id = $1`, projectID) })

	a, err := s.AddIdeaNote(projectID, "first")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}
	b, err := s.AddIdeaNote(projectID, "second")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}
	c, err := s.AddIdeaNote(projectID, "third")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}

	// Starting order: first, second, third.
	notes, _ := s.ListIdeaNotes(projectID)
	assertOrder(t, notes, "first", "second", "third")

	// Drag "third" to the front in one drop: third, first, second.
	if err := s.ReorderIdeaNotes(projectID, []string{c.ID, a.ID, b.ID}); err != nil {
		t.Fatalf("ReorderIdeaNotes: %v", err)
	}
	notes, _ = s.ListIdeaNotes(projectID)
	assertOrder(t, notes, "third", "first", "second")

	// A second drop, fully reversing the order in one call.
	if err := s.ReorderIdeaNotes(projectID, []string{b.ID, a.ID, c.ID}); err != nil {
		t.Fatalf("ReorderIdeaNotes: %v", err)
	}
	notes, _ = s.ListIdeaNotes(projectID)
	assertOrder(t, notes, "second", "first", "third")
}

func TestReorderIdeaNotes_IgnoresIdsFromAnotherProject(t *testing.T) {
	s := testStore(t)
	projectA := uuid.New().String()
	projectB := uuid.New().String()
	t.Cleanup(func() {
		s.db.Exec(`DELETE FROM story_idea_notes WHERE project_id IN ($1, $2)`, projectA, projectB)
	})

	a, err := s.AddIdeaNote(projectA, "belongs to A")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}
	foreign, err := s.AddIdeaNote(projectB, "belongs to B")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}

	// Reordering project A with a foreign ID mixed in must not touch B's
	// note — each UPDATE is scoped by project_id, so the foreign ID is
	// silently skipped rather than reassigning another project's data.
	if err := s.ReorderIdeaNotes(projectA, []string{foreign.ID, a.ID}); err != nil {
		t.Fatalf("ReorderIdeaNotes: %v", err)
	}

	notesB, _ := s.ListIdeaNotes(projectB)
	if len(notesB) != 1 || notesB[0].Position != foreign.Position {
		t.Errorf("expected project B's note to be untouched, got %+v", notesB)
	}
}

func assertOrder(t *testing.T, notes []*IdeaNote, wantTexts ...string) {
	t.Helper()
	if len(notes) != len(wantTexts) {
		t.Fatalf("expected %d notes, got %d: %+v", len(wantTexts), len(notes), notes)
	}
	for i, want := range wantTexts {
		if notes[i].Text != want {
			t.Errorf("position %d: expected %q, got %q (full order: %v)", i, want, notes[i].Text, textsOf(notes))
		}
	}
}

func textsOf(notes []*IdeaNote) []string {
	out := make([]string, len(notes))
	for i, n := range notes {
		out[i] = n.Text
	}
	return out
}

func TestUpdateIdeaNote_ScopedToProject(t *testing.T) {
	s := testStore(t)
	projectA := uuid.New().String()
	projectB := uuid.New().String()
	t.Cleanup(func() {
		s.db.Exec(`DELETE FROM story_idea_notes WHERE project_id IN ($1, $2)`, projectA, projectB)
	})

	note, err := s.AddIdeaNote(projectA, "belongs to project A")
	if err != nil {
		t.Fatalf("AddIdeaNote: %v", err)
	}

	// Editing project A's note while scoped to project B must not succeed —
	// a note's ID alone isn't enough to authorize an edit across projects.
	if _, err := s.UpdateIdeaNote(projectB, note.ID, "hijacked"); err == nil {
		t.Fatal("expected an error when updating a note through the wrong project")
	}

	notes, _ := s.ListIdeaNotes(projectA)
	if len(notes) != 1 || notes[0].Text != "belongs to project A" {
		t.Errorf("expected project A's note to be unchanged, got %+v", notes)
	}
}
