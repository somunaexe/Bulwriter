package casting

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Role is one character's casting status — keyed by character name (the
// exact text of that character's cue), same convention as
// breakdown.SceneBreakdown's scene_key.
type Role struct {
	ID            string    `json:"id"`
	ScriptID      string    `json:"scriptId"`
	CharacterName string    `json:"characterName"`
	ActorName     string    `json:"actorName"`
	Contact       string    `json:"contact"`
	Status        string    `json:"status"` // "open" | "submitted" | "callback" | "cast"
	Notes         string    `json:"notes"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Role, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, character_name, actor_name, contact, status, notes, updated_at
		 FROM casting_roles WHERE script_id = $1
		 ORDER BY character_name ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying casting roles: %w", err)
	}
	defer rows.Close()

	var out []*Role
	for rows.Next() {
		r := &Role{}
		if err := rows.Scan(&r.ID, &r.ScriptID, &r.CharacterName, &r.ActorName, &r.Contact, &r.Status, &r.Notes, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning casting role: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Upsert stores a character's casting fields, creating the row on first
// tag and overwriting it on every subsequent one — one row per
// character_name, not a history of changes.
func (s *Store) Upsert(scriptID, characterName, actorName, contact, status, notes string) (*Role, error) {
	if status == "" {
		status = "open"
	}

	r := &Role{
		ID:            uuid.New().String(),
		ScriptID:      scriptID,
		CharacterName: characterName,
		ActorName:     actorName,
		Contact:       contact,
		Status:        status,
		Notes:         notes,
		UpdatedAt:     time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO casting_roles (id, script_id, character_name, actor_name, contact, status, notes, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (script_id, character_name)
		 DO UPDATE SET actor_name = EXCLUDED.actor_name, contact = EXCLUDED.contact,
		               status = EXCLUDED.status, notes = EXCLUDED.notes,
		               updated_at = EXCLUDED.updated_at`,
		r.ID, r.ScriptID, r.CharacterName, r.ActorName, r.Contact, r.Status, r.Notes, r.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upserting casting role: %w", err)
	}
	return r, nil
}
