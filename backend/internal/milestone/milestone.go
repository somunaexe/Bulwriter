package milestone

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Milestone is one post-production stage tracked for a script (rough
// cut, picture lock, sound mix, color grade, final export, etc.) —
// Phase 4's lightweight checklist, position-ordered per script same as
// budget line items / press kit stills.
type Milestone struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	Label     string    `json:"label"`
	Status    string    `json:"status"` // "not_started" | "in_progress" | "done"
	Notes     string    `json:"notes"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Milestone, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, label, status, notes, position, created_at
		 FROM milestones WHERE script_id = $1
		 ORDER BY position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying milestones: %w", err)
	}
	defer rows.Close()

	var out []*Milestone
	for rows.Next() {
		m := &Milestone{}
		if err := rows.Scan(&m.ID, &m.ScriptID, &m.Label, &m.Status, &m.Notes, &m.Position, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning milestone: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, label, status, notes string) (*Milestone, error) {
	if status == "" {
		status = "not_started"
	}

	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM milestones WHERE script_id = $1`,
		scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing milestone position: %w", err)
	}

	m := &Milestone{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		Label:     label,
		Status:    status,
		Notes:     notes,
		Position:  nextPosition,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO milestones (id, script_id, label, status, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		m.ID, m.ScriptID, m.Label, m.Status, m.Notes, m.Position, m.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting milestone: %w", err)
	}
	return m, nil
}

func (s *Store) Update(scriptID, id, label, status, notes string) (*Milestone, error) {
	_, err := s.db.Exec(
		`UPDATE milestones SET label = $1, status = $2, notes = $3
		 WHERE id = $4 AND script_id = $5`,
		label, status, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating milestone: %w", err)
	}
	return &Milestone{ID: id, ScriptID: scriptID, Label: label, Status: status, Notes: notes}, nil
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM milestones WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing milestone: %w", err)
	}
	return nil
}
