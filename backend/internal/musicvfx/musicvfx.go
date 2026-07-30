package musicvfx

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Note is one music or VFX suggestion for a scene — Kind ("music" or
// "vfx") distinguishes which of the two lightweight lists it belongs
// to. Position is scoped per (script_id, scene_key, kind), so music
// and VFX suggestions for the same scene are numbered independently of
// each other, same reasoning as shotlist.Shot's position.
type Note struct {
	ID          string    `json:"id"`
	ScriptID    string    `json:"scriptId"`
	SceneKey    string    `json:"sceneKey"`
	Kind        string    `json:"kind"`
	Description string    `json:"description"`
	Status      string    `json:"status"` // "suggested" | "confirmed" | "done"
	Notes       string    `json:"notes"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Note, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, kind, description, status, notes, position, created_at
		 FROM scene_notes WHERE script_id = $1
		 ORDER BY scene_key ASC, kind ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying scene notes: %w", err)
	}
	defer rows.Close()

	var out []*Note
	for rows.Next() {
		n := &Note{}
		if err := rows.Scan(&n.ID, &n.ScriptID, &n.SceneKey, &n.Kind, &n.Description, &n.Status, &n.Notes, &n.Position, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning scene note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, sceneKey, kind, description, status, notes string) (*Note, error) {
	if status == "" {
		status = "suggested"
	}

	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM scene_notes WHERE script_id = $1 AND scene_key = $2 AND kind = $3`,
		scriptID, sceneKey, kind,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing note position: %w", err)
	}

	n := &Note{
		ID:          uuid.New().String(),
		ScriptID:    scriptID,
		SceneKey:    sceneKey,
		Kind:        kind,
		Description: description,
		Status:      status,
		Notes:       notes,
		Position:    nextPosition,
		CreatedAt:   time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO scene_notes (id, script_id, scene_key, kind, description, status, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		n.ID, n.ScriptID, n.SceneKey, n.Kind, n.Description, n.Status, n.Notes, n.Position, n.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting scene note: %w", err)
	}
	return n, nil
}

func (s *Store) Update(scriptID, id, description, status, notes string) (*Note, error) {
	_, err := s.db.Exec(
		`UPDATE scene_notes SET description = $1, status = $2, notes = $3
		 WHERE id = $4 AND script_id = $5`,
		description, status, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating scene note: %w", err)
	}
	return &Note{ID: id, ScriptID: scriptID, Description: description, Status: status, Notes: notes}, nil
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM scene_notes WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing scene note: %w", err)
	}
	return nil
}
