package breakdown

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// SceneBreakdown holds the production tags for one scene — props and
// notes, keyed by the scene's heading text (see scene_key in the
// migration). Locations and cast are never stored here; the frontend
// derives those live from the script text itself.
type SceneBreakdown struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	SceneKey  string    `json:"sceneKey"`
	Props     []string  `json:"props"`
	Notes     string    `json:"notes"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*SceneBreakdown, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, props, notes, updated_at
		 FROM scene_breakdowns WHERE script_id = $1
		 ORDER BY scene_key ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying scene breakdowns: %w", err)
	}
	defer rows.Close()

	var out []*SceneBreakdown
	for rows.Next() {
		b := &SceneBreakdown{}
		var propsJSON string
		if err := rows.Scan(&b.ID, &b.ScriptID, &b.SceneKey, &propsJSON, &b.Notes, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning scene breakdown: %w", err)
		}
		b.Props = decodeProps(propsJSON)
		out = append(out, b)
	}
	return out, rows.Err()
}

// Upsert stores props/notes for a scene, creating the row on first tag
// and overwriting it on every subsequent one (there's exactly one tag
// set per scene_key, not a history of them).
func (s *Store) Upsert(scriptID, sceneKey string, props []string, notes string) (*SceneBreakdown, error) {
	if props == nil {
		props = []string{}
	}
	propsJSON, err := json.Marshal(props)
	if err != nil {
		return nil, fmt.Errorf("encoding props: %w", err)
	}

	b := &SceneBreakdown{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		SceneKey:  sceneKey,
		Props:     props,
		Notes:     notes,
		UpdatedAt: time.Now(),
	}
	_, err = s.db.Exec(
		`INSERT INTO scene_breakdowns (id, script_id, scene_key, props, notes, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (script_id, scene_key)
		 DO UPDATE SET props = EXCLUDED.props, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
		b.ID, b.ScriptID, b.SceneKey, string(propsJSON), b.Notes, b.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upserting scene breakdown: %w", err)
	}
	return b, nil
}

func decodeProps(propsJSON string) []string {
	var props []string
	if err := json.Unmarshal([]byte(propsJSON), &props); err != nil {
		return []string{}
	}
	return props
}
