package continuity

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Note is one continuity log entry for a scene during the shoot — a
// take label, freeform continuity details (props, costume, eyelines),
// and a flag for entries that need the editor's attention. Position is
// scoped per (script_id, scene_key), same as scene_notes.
type Note struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	SceneKey  string    `json:"sceneKey"`
	Take      string    `json:"take"`
	Note      string    `json:"note"`
	Flagged   bool      `json:"flagged"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Note, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, take, note, flagged, position, created_at
		 FROM continuity_notes WHERE script_id = $1
		 ORDER BY scene_key ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying continuity notes: %w", err)
	}
	defer rows.Close()

	var out []*Note
	for rows.Next() {
		n := &Note{}
		if err := rows.Scan(&n.ID, &n.ScriptID, &n.SceneKey, &n.Take, &n.Note, &n.Flagged, &n.Position, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning continuity note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, sceneKey, take, note string, flagged bool) (*Note, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM continuity_notes WHERE script_id = $1 AND scene_key = $2`,
		scriptID, sceneKey,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing continuity note position: %w", err)
	}

	n := &Note{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		SceneKey:  sceneKey,
		Take:      take,
		Note:      note,
		Flagged:   flagged,
		Position:  nextPosition,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO continuity_notes (id, script_id, scene_key, take, note, flagged, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		n.ID, n.ScriptID, n.SceneKey, n.Take, n.Note, n.Flagged, n.Position, n.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting continuity note: %w", err)
	}
	return n, nil
}

func (s *Store) Update(scriptID, id, take, note string, flagged bool) (*Note, error) {
	_, err := s.db.Exec(
		`UPDATE continuity_notes SET take = $1, note = $2, flagged = $3
		 WHERE id = $4 AND script_id = $5`,
		take, note, flagged, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating continuity note: %w", err)
	}
	return &Note{ID: id, ScriptID: scriptID, Take: take, Note: note, Flagged: flagged}, nil
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(`DELETE FROM continuity_notes WHERE id = $1 AND script_id = $2`, id, scriptID)
	if err != nil {
		return fmt.Errorf("removing continuity note: %w", err)
	}
	return nil
}
