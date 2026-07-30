package shotlist

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Shot is one entry in a scene's shot list — keyed by scene_key like
// breakdown/casting, with a Position that IS the shot number (shot 1,
// shot 2, ...), since a shot list is fundamentally a sequence, not just
// a set. Image is an optional storyboard frame, same data-URI
// convention as scouting.Candidate.Photo.
type Shot struct {
	ID          string    `json:"id"`
	ScriptID    string    `json:"scriptId"`
	SceneKey    string    `json:"sceneKey"`
	ShotType    string    `json:"shotType"`
	Description string    `json:"description"`
	Image       string    `json:"image"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Shot, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, shot_type, description, image, position, created_at
		 FROM shots WHERE script_id = $1
		 ORDER BY scene_key ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying shots: %w", err)
	}
	defer rows.Close()

	var out []*Shot
	for rows.Next() {
		sh := &Shot{}
		if err := rows.Scan(&sh.ID, &sh.ScriptID, &sh.SceneKey, &sh.ShotType, &sh.Description, &sh.Image, &sh.Position, &sh.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning shot: %w", err)
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, sceneKey, shotType, description, image string) (*Shot, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM shots WHERE script_id = $1 AND scene_key = $2`,
		scriptID, sceneKey,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing shot position: %w", err)
	}

	sh := &Shot{
		ID:          uuid.New().String(),
		ScriptID:    scriptID,
		SceneKey:    sceneKey,
		ShotType:    shotType,
		Description: description,
		Image:       image,
		Position:    nextPosition,
		CreatedAt:   time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO shots (id, script_id, scene_key, shot_type, description, image, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		sh.ID, sh.ScriptID, sh.SceneKey, sh.ShotType, sh.Description, sh.Image, sh.Position, sh.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting shot: %w", err)
	}
	return sh, nil
}

func (s *Store) Update(scriptID, id, shotType, description, image string) (*Shot, error) {
	_, err := s.db.Exec(
		`UPDATE shots SET shot_type = $1, description = $2, image = $3
		 WHERE id = $4 AND script_id = $5`,
		shotType, description, image, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating shot: %w", err)
	}
	return &Shot{ID: id, ScriptID: scriptID, ShotType: shotType, Description: description, Image: image}, nil
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM shots WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing shot: %w", err)
	}
	return nil
}
