package schedule

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Strip is one scene's slot in the shooting schedule — keyed by scene
// heading text (scene_key), same convention as breakdown.SceneBreakdown.
type Strip struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	SceneKey  string    `json:"sceneKey"`
	DayNumber int       `json:"dayNumber"`
	Position  int       `json:"position"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// StripInput is what the client sends to replace the schedule — no ID,
// since the whole thing is rewritten rather than patched field-by-field.
type StripInput struct {
	SceneKey  string `json:"sceneKey"`
	DayNumber int    `json:"dayNumber"`
	Position  int    `json:"position"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Strip, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, day_number, position, updated_at
		 FROM schedule_strips WHERE script_id = $1
		 ORDER BY day_number ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying schedule: %w", err)
	}
	defer rows.Close()

	var out []*Strip
	for rows.Next() {
		st := &Strip{}
		if err := rows.Scan(&st.ID, &st.ScriptID, &st.SceneKey, &st.DayNumber, &st.Position, &st.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning strip: %w", err)
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// Replace wipes and rewrites the whole schedule for a script in one
// transaction — a drag-and-drop reorder touches many strips' day/position
// at once, so replacing the full set is simpler and more robust than
// diffing against what's currently stored.
func (s *Store) Replace(scriptID string, strips []StripInput) ([]*Strip, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM schedule_strips WHERE script_id = $1`, scriptID); err != nil {
		return nil, fmt.Errorf("clearing schedule: %w", err)
	}

	now := time.Now()
	out := make([]*Strip, 0, len(strips))
	for _, in := range strips {
		st := &Strip{
			ID:        uuid.New().String(),
			ScriptID:  scriptID,
			SceneKey:  in.SceneKey,
			DayNumber: in.DayNumber,
			Position:  in.Position,
			UpdatedAt: now,
		}
		if _, err := tx.Exec(
			`INSERT INTO schedule_strips (id, script_id, scene_key, day_number, position, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			st.ID, st.ScriptID, st.SceneKey, st.DayNumber, st.Position, st.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("inserting strip: %w", err)
		}
		out = append(out, st)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("committing schedule: %w", err)
	}
	return out, nil
}
