package breakdown

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// SceneBreakdown holds the production tags for one scene — props,
// costumes, set dressing, and notes, keyed by the scene's heading text
// (see scene_key in the migration). Locations and cast are never
// stored here; the frontend derives those live from the script text
// itself.
type SceneBreakdown struct {
	ID          string    `json:"id"`
	ScriptID    string    `json:"scriptId"`
	SceneKey    string    `json:"sceneKey"`
	Props       []string  `json:"props"`
	Costumes    []string  `json:"costumes"`
	SetDressing []string  `json:"setDressing"`
	Notes       string    `json:"notes"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*SceneBreakdown, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, props, costumes, set_dressing, notes, updated_at
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
		var propsJSON, costumesJSON, dressingJSON string
		if err := rows.Scan(&b.ID, &b.ScriptID, &b.SceneKey, &propsJSON, &costumesJSON, &dressingJSON, &b.Notes, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning scene breakdown: %w", err)
		}
		b.Props = decodeStringList(propsJSON)
		b.Costumes = decodeStringList(costumesJSON)
		b.SetDressing = decodeStringList(dressingJSON)
		out = append(out, b)
	}
	return out, rows.Err()
}

// Upsert stores props/costumes/set dressing/notes for a scene, creating
// the row on first tag and overwriting it on every subsequent one —
// there's exactly one tag set per scene_key, not a history of them.
func (s *Store) Upsert(scriptID, sceneKey string, props, costumes, setDressing []string, notes string) (*SceneBreakdown, error) {
	if props == nil {
		props = []string{}
	}
	if costumes == nil {
		costumes = []string{}
	}
	if setDressing == nil {
		setDressing = []string{}
	}
	propsJSON, err := json.Marshal(props)
	if err != nil {
		return nil, fmt.Errorf("encoding props: %w", err)
	}
	costumesJSON, err := json.Marshal(costumes)
	if err != nil {
		return nil, fmt.Errorf("encoding costumes: %w", err)
	}
	dressingJSON, err := json.Marshal(setDressing)
	if err != nil {
		return nil, fmt.Errorf("encoding set dressing: %w", err)
	}

	b := &SceneBreakdown{
		ID:          uuid.New().String(),
		ScriptID:    scriptID,
		SceneKey:    sceneKey,
		Props:       props,
		Costumes:    costumes,
		SetDressing: setDressing,
		Notes:       notes,
		UpdatedAt:   time.Now(),
	}
	_, err = s.db.Exec(
		`INSERT INTO scene_breakdowns (id, script_id, scene_key, props, costumes, set_dressing, notes, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (script_id, scene_key)
		 DO UPDATE SET props = EXCLUDED.props, costumes = EXCLUDED.costumes, set_dressing = EXCLUDED.set_dressing,
		               notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
		b.ID, b.ScriptID, b.SceneKey, string(propsJSON), string(costumesJSON), string(dressingJSON), b.Notes, b.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upserting scene breakdown: %w", err)
	}
	return b, nil
}

func decodeStringList(encoded string) []string {
	var list []string
	if err := json.Unmarshal([]byte(encoded), &list); err != nil {
		return []string{}
	}
	return list
}
