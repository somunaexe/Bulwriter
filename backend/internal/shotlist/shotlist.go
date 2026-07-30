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
// a set. ShotSize/CameraAngle/CameraMovement are three independent
// fields rather than one combined string, so each is queryable on its
// own later. Image is an optional storyboard frame, same data-URI
// convention as scouting.Candidate.Photo; ImageFilename is the original
// filename, kept alongside it purely so the UI can show it under the
// thumbnail (a data URI carries no filename of its own).
type Shot struct {
	ID             string    `json:"id"`
	ScriptID       string    `json:"scriptId"`
	SceneKey       string    `json:"sceneKey"`
	ShotSize       string    `json:"shotSize"`
	CameraAngle    string    `json:"cameraAngle"`
	CameraMovement string    `json:"cameraMovement"`
	Description    string    `json:"description"`
	Image          string    `json:"image"`
	ImageFilename  string    `json:"imageFilename"`
	Position       int       `json:"position"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Shot, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, scene_key, shot_size, camera_angle, camera_movement, description, image, image_filename, position, created_at
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
		if err := rows.Scan(
			&sh.ID, &sh.ScriptID, &sh.SceneKey, &sh.ShotSize, &sh.CameraAngle, &sh.CameraMovement,
			&sh.Description, &sh.Image, &sh.ImageFilename, &sh.Position, &sh.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning shot: %w", err)
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, sceneKey, shotSize, cameraAngle, cameraMovement, description, image, imageFilename string) (*Shot, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM shots WHERE script_id = $1 AND scene_key = $2`,
		scriptID, sceneKey,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing shot position: %w", err)
	}

	sh := &Shot{
		ID:             uuid.New().String(),
		ScriptID:       scriptID,
		SceneKey:       sceneKey,
		ShotSize:       shotSize,
		CameraAngle:    cameraAngle,
		CameraMovement: cameraMovement,
		Description:    description,
		Image:          image,
		ImageFilename:  imageFilename,
		Position:       nextPosition,
		CreatedAt:      time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO shots (id, script_id, scene_key, shot_size, camera_angle, camera_movement, description, image, image_filename, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		sh.ID, sh.ScriptID, sh.SceneKey, sh.ShotSize, sh.CameraAngle, sh.CameraMovement,
		sh.Description, sh.Image, sh.ImageFilename, sh.Position, sh.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting shot: %w", err)
	}
	return sh, nil
}

func (s *Store) Update(scriptID, id, shotSize, cameraAngle, cameraMovement, description, image, imageFilename string) (*Shot, error) {
	_, err := s.db.Exec(
		`UPDATE shots SET shot_size = $1, camera_angle = $2, camera_movement = $3, description = $4, image = $5, image_filename = $6
		 WHERE id = $7 AND script_id = $8`,
		shotSize, cameraAngle, cameraMovement, description, image, imageFilename, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating shot: %w", err)
	}
	return &Shot{
		ID: id, ScriptID: scriptID, ShotSize: shotSize, CameraAngle: cameraAngle, CameraMovement: cameraMovement,
		Description: description, Image: image, ImageFilename: imageFilename,
	}, nil
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
