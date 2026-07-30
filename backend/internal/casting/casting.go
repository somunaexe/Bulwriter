package casting

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Candidate is one actor auditioning for a character — keyed by
// character_name (the exact text of that character's cue), same
// convention as breakdown.SceneBreakdown's scene_key. Several
// candidates can share a character_name; at most one IsCast, same
// "candidates, pick one" shape as scouting.Candidate/IsSelected.
type Candidate struct {
	ID            string    `json:"id"`
	ScriptID      string    `json:"scriptId"`
	CharacterName string    `json:"characterName"`
	ActorName     string    `json:"actorName"`
	Contact       string    `json:"contact"`
	Status        string    `json:"status"` // "open" | "submitted" | "callback" — audition progress, independent of IsCast
	Notes         string    `json:"notes"`
	IsCast        bool      `json:"isCast"`
	Position      int       `json:"position"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Candidate, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, character_name, actor_name, contact, status, notes, is_cast, position, created_at
		 FROM casting_roles WHERE script_id = $1
		 ORDER BY character_name ASC, position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying casting candidates: %w", err)
	}
	defer rows.Close()

	var out []*Candidate
	for rows.Next() {
		c := &Candidate{}
		if err := rows.Scan(&c.ID, &c.ScriptID, &c.CharacterName, &c.ActorName, &c.Contact, &c.Status, &c.Notes, &c.IsCast, &c.Position, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning casting candidate: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, characterName, actorName, contact, status, notes string) (*Candidate, error) {
	if status == "" {
		status = "open"
	}

	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM casting_roles WHERE script_id = $1 AND character_name = $2`,
		scriptID, characterName,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing candidate position: %w", err)
	}

	c := &Candidate{
		ID:            uuid.New().String(),
		ScriptID:      scriptID,
		CharacterName: characterName,
		ActorName:     actorName,
		Contact:       contact,
		Status:        status,
		Notes:         notes,
		Position:      nextPosition,
		CreatedAt:     time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO casting_roles (id, script_id, character_name, actor_name, contact, status, notes, is_cast, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)`,
		c.ID, c.ScriptID, c.CharacterName, c.ActorName, c.Contact, c.Status, c.Notes, c.Position, c.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting casting candidate: %w", err)
	}
	return c, nil
}

func (s *Store) Update(scriptID, id, actorName, contact, status, notes string) (*Candidate, error) {
	_, err := s.db.Exec(
		`UPDATE casting_roles SET actor_name = $1, contact = $2, status = $3, notes = $4
		 WHERE id = $5 AND script_id = $6`,
		actorName, contact, status, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating casting candidate: %w", err)
	}
	return &Candidate{ID: id, ScriptID: scriptID, ActorName: actorName, Contact: contact, Status: status, Notes: notes}, nil
}

// Cast marks one candidate as the chosen actor for its character_name,
// clearing any other candidate previously cast for that same character —
// at most one cast candidate per character, same reasoning as
// scouting.Store.Select.
func (s *Store) Cast(scriptID, id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer tx.Rollback()

	var characterName string
	if err := tx.QueryRow(
		`SELECT character_name FROM casting_roles WHERE id = $1 AND script_id = $2`, id, scriptID,
	).Scan(&characterName); err != nil {
		return fmt.Errorf("finding candidate: %w", err)
	}

	if _, err := tx.Exec(
		`UPDATE casting_roles SET is_cast = false WHERE script_id = $1 AND character_name = $2`,
		scriptID, characterName,
	); err != nil {
		return fmt.Errorf("clearing previous cast: %w", err)
	}

	if _, err := tx.Exec(
		`UPDATE casting_roles SET is_cast = true WHERE id = $1 AND script_id = $2`, id, scriptID,
	); err != nil {
		return fmt.Errorf("setting cast: %w", err)
	}

	return tx.Commit()
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM casting_roles WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing casting candidate: %w", err)
	}
	return nil
}
