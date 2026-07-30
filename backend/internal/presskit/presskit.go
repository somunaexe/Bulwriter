package presskit

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PressKit holds the one-per-script fields that aren't a repeatable
// list — director's statement and the poster image. Synopsis/logline
// live in story.ScriptStory instead; the press kit reads them from
// there rather than duplicating them.
type PressKit struct {
	ScriptID          string    `json:"scriptId"`
	DirectorStatement string    `json:"directorStatement"`
	Poster            string    `json:"poster"`
	PosterFilename    string    `json:"posterFilename"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// Still is one production photo in the press kit's stills list.
type Still struct {
	ID            string    `json:"id"`
	ScriptID      string    `json:"scriptId"`
	Image         string    `json:"image"`
	ImageFilename string    `json:"imageFilename"`
	Caption       string    `json:"caption"`
	Position      int       `json:"position"`
	CreatedAt     time.Time `json:"createdAt"`
}

// Bio is a press blurb for one cast candidate or crew member, scoped to
// this script's press kit — Kind distinguishes which of casting_roles
// or crew the PersonID refers to.
type Bio struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	Kind      string    `json:"kind"` // "cast" | "crew"
	PersonID  string    `json:"personId"`
	Bio       string    `json:"bio"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) GetPressKit(scriptID string) (*PressKit, error) {
	pk := &PressKit{ScriptID: scriptID}
	err := s.db.QueryRow(
		`SELECT director_statement, poster, poster_filename, updated_at
		 FROM press_kits WHERE script_id = $1`, scriptID,
	).Scan(&pk.DirectorStatement, &pk.Poster, &pk.PosterFilename, &pk.UpdatedAt)
	if err == sql.ErrNoRows {
		pk.UpdatedAt = time.Now()
		return pk, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying press kit: %w", err)
	}
	return pk, nil
}

func (s *Store) SetPressKit(scriptID, directorStatement, poster, posterFilename string) (*PressKit, error) {
	pk := &PressKit{
		ScriptID:          scriptID,
		DirectorStatement: directorStatement,
		Poster:            poster,
		PosterFilename:    posterFilename,
		UpdatedAt:         time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO press_kits (script_id, director_statement, poster, poster_filename, updated_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (script_id)
		 DO UPDATE SET director_statement = EXCLUDED.director_statement, poster = EXCLUDED.poster,
		               poster_filename = EXCLUDED.poster_filename, updated_at = EXCLUDED.updated_at`,
		pk.ScriptID, pk.DirectorStatement, pk.Poster, pk.PosterFilename, pk.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving press kit: %w", err)
	}
	return pk, nil
}

func (s *Store) ListStills(scriptID string) ([]*Still, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, image, image_filename, caption, position, created_at
		 FROM press_kit_stills WHERE script_id = $1
		 ORDER BY position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying stills: %w", err)
	}
	defer rows.Close()

	var out []*Still
	for rows.Next() {
		st := &Still{}
		if err := rows.Scan(&st.ID, &st.ScriptID, &st.Image, &st.ImageFilename, &st.Caption, &st.Position, &st.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning still: %w", err)
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

func (s *Store) AddStill(scriptID, image, imageFilename, caption string) (*Still, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM press_kit_stills WHERE script_id = $1`, scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing still position: %w", err)
	}

	st := &Still{
		ID:            uuid.New().String(),
		ScriptID:      scriptID,
		Image:         image,
		ImageFilename: imageFilename,
		Caption:       caption,
		Position:      nextPosition,
		CreatedAt:     time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO press_kit_stills (id, script_id, image, image_filename, caption, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		st.ID, st.ScriptID, st.Image, st.ImageFilename, st.Caption, st.Position, st.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting still: %w", err)
	}
	return st, nil
}

func (s *Store) UpdateStill(scriptID, id, image, imageFilename, caption string) (*Still, error) {
	_, err := s.db.Exec(
		`UPDATE press_kit_stills SET image = $1, image_filename = $2, caption = $3
		 WHERE id = $4 AND script_id = $5`,
		image, imageFilename, caption, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating still: %w", err)
	}
	return &Still{ID: id, ScriptID: scriptID, Image: image, ImageFilename: imageFilename, Caption: caption}, nil
}

func (s *Store) RemoveStill(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM press_kit_stills WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing still: %w", err)
	}
	return nil
}

func (s *Store) ListBios(scriptID string) ([]*Bio, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, kind, person_id, bio, updated_at
		 FROM press_kit_bios WHERE script_id = $1`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying bios: %w", err)
	}
	defer rows.Close()

	var out []*Bio
	for rows.Next() {
		b := &Bio{}
		if err := rows.Scan(&b.ID, &b.ScriptID, &b.Kind, &b.PersonID, &b.Bio, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning bio: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// SetBio creates or overwrites the one bio for a given (script, kind,
// person) — a person has at most one bio per script's press kit, same
// upsert-by-natural-key shape as casting.Store.Update... but keyed on
// the triple rather than an existing row ID, since there may not be
// one yet.
func (s *Store) SetBio(scriptID, kind, personID, bio string) (*Bio, error) {
	b := &Bio{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		Kind:      kind,
		PersonID:  personID,
		Bio:       bio,
		UpdatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO press_kit_bios (id, script_id, kind, person_id, bio, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (script_id, kind, person_id)
		 DO UPDATE SET bio = EXCLUDED.bio, updated_at = EXCLUDED.updated_at`,
		b.ID, b.ScriptID, b.Kind, b.PersonID, b.Bio, b.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving bio: %w", err)
	}
	return b, nil
}
