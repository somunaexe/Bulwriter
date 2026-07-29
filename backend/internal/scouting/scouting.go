package scouting

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Candidate is one real-world option being considered for a script's
// location — keyed by location_key (the normalized location name the
// frontend also uses to group the stripboard's shoot days). Several
// candidates can share a location_key; at most one is IsSelected.
type Candidate struct {
	ID          string    `json:"id"`
	ScriptID    string    `json:"scriptId"`
	LocationKey string    `json:"locationKey"`
	Name        string    `json:"name"`
	Address     string    `json:"address"`
	Notes       string    `json:"notes"`
	Photo       string    `json:"photo"`
	IsSelected  bool      `json:"isSelected"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Candidate, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, location_key, name, address, notes, photo, is_selected, position, created_at
		 FROM scout_candidates WHERE script_id = $1
		 ORDER BY location_key ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying scout candidates: %w", err)
	}
	defer rows.Close()

	var out []*Candidate
	for rows.Next() {
		c := &Candidate{}
		if err := rows.Scan(&c.ID, &c.ScriptID, &c.LocationKey, &c.Name, &c.Address, &c.Notes, &c.Photo, &c.IsSelected, &c.Position, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning scout candidate: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, locationKey, name, address, notes, photo string) (*Candidate, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM scout_candidates WHERE script_id = $1 AND location_key = $2`,
		scriptID, locationKey,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing candidate position: %w", err)
	}

	c := &Candidate{
		ID:          uuid.New().String(),
		ScriptID:    scriptID,
		LocationKey: locationKey,
		Name:        name,
		Address:     address,
		Notes:       notes,
		Photo:       photo,
		Position:    nextPosition,
		CreatedAt:   time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO scout_candidates (id, script_id, location_key, name, address, notes, photo, is_selected, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)`,
		c.ID, c.ScriptID, c.LocationKey, c.Name, c.Address, c.Notes, c.Photo, c.Position, c.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting scout candidate: %w", err)
	}
	return c, nil
}

func (s *Store) Update(scriptID, id, name, address, notes, photo string) (*Candidate, error) {
	_, err := s.db.Exec(
		`UPDATE scout_candidates SET name = $1, address = $2, notes = $3, photo = $4
		 WHERE id = $5 AND script_id = $6`,
		name, address, notes, photo, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating scout candidate: %w", err)
	}
	return &Candidate{ID: id, ScriptID: scriptID, Name: name, Address: address, Notes: notes, Photo: photo}, nil
}

// Select marks one candidate as the chosen location for its location_key,
// clearing any other candidate previously selected for that same key —
// at most one selected candidate per location, enforced here rather than
// with a DB constraint since Postgres partial unique indexes on a
// boolean column are more ceremony than this needs.
func (s *Store) Select(scriptID, id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback()

	var locationKey string
	if err := tx.QueryRow(
		`SELECT location_key FROM scout_candidates WHERE id = $1 AND script_id = $2`, id, scriptID,
	).Scan(&locationKey); err != nil {
		return fmt.Errorf("finding candidate: %w", err)
	}

	if _, err := tx.Exec(
		`UPDATE scout_candidates SET is_selected = false WHERE script_id = $1 AND location_key = $2`,
		scriptID, locationKey,
	); err != nil {
		return fmt.Errorf("clearing previous selection: %w", err)
	}

	if _, err := tx.Exec(
		`UPDATE scout_candidates SET is_selected = true WHERE id = $1 AND script_id = $2`, id, scriptID,
	); err != nil {
		return fmt.Errorf("setting selection: %w", err)
	}

	return tx.Commit()
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM scout_candidates WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing scout candidate: %w", err)
	}
	return nil
}
