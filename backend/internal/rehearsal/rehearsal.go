package rehearsal

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Rehearsal is one rehearsal session logged for a script — a date,
// time, what's being rehearsed (scenes/characters, freeform), and
// notes, position-ordered per script same as milestones.
type Rehearsal struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	Date      string    `json:"date"`
	Time      string    `json:"time"`
	Focus     string    `json:"focus"`
	Notes     string    `json:"notes"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) List(scriptID string) ([]*Rehearsal, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, date, time, focus, notes, position, created_at
		 FROM rehearsals WHERE script_id = $1
		 ORDER BY position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying rehearsals: %w", err)
	}
	defer rows.Close()

	var out []*Rehearsal
	for rows.Next() {
		re := &Rehearsal{}
		if err := rows.Scan(&re.ID, &re.ScriptID, &re.Date, &re.Time, &re.Focus, &re.Notes, &re.Position, &re.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning rehearsal: %w", err)
		}
		out = append(out, re)
	}
	return out, rows.Err()
}

func (s *Store) Add(scriptID, date, time_, focus, notes string) (*Rehearsal, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM rehearsals WHERE script_id = $1`, scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing rehearsal position: %w", err)
	}

	re := &Rehearsal{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		Date:      date,
		Time:      time_,
		Focus:     focus,
		Notes:     notes,
		Position:  nextPosition,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO rehearsals (id, script_id, date, time, focus, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		re.ID, re.ScriptID, re.Date, re.Time, re.Focus, re.Notes, re.Position, re.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting rehearsal: %w", err)
	}
	return re, nil
}

func (s *Store) Update(scriptID, id, date, time_, focus, notes string) (*Rehearsal, error) {
	_, err := s.db.Exec(
		`UPDATE rehearsals SET date = $1, time = $2, focus = $3, notes = $4
		 WHERE id = $5 AND script_id = $6`,
		date, time_, focus, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating rehearsal: %w", err)
	}
	return &Rehearsal{ID: id, ScriptID: scriptID, Date: date, Time: time_, Focus: focus, Notes: notes}, nil
}

func (s *Store) Remove(scriptID, id string) error {
	_, err := s.db.Exec(`DELETE FROM rehearsals WHERE id = $1 AND script_id = $2`, id, scriptID)
	if err != nil {
		return fmt.Errorf("removing rehearsal: %w", err)
	}
	return nil
}
