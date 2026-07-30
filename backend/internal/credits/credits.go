package credits

import (
	"database/sql"
	"fmt"
	"time"
)

// Credits holds the one-per-script field that isn't already derivable
// from another feature — cast and crew names are pulled live from
// casting/crew (same reasoning as the press kit), so all that's
// stored here is freeform text for anything else that belongs in the
// end-credits roll: music licences, location acknowledgements,
// funding/sponsor logos.
type Credits struct {
	ScriptID          string    `json:"scriptId"`
	AdditionalCredits string    `json:"additionalCredits"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Get(scriptID string) (*Credits, error) {
	c := &Credits{ScriptID: scriptID}
	err := s.db.QueryRow(
		`SELECT additional_credits, updated_at FROM credits WHERE script_id = $1`, scriptID,
	).Scan(&c.AdditionalCredits, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		c.UpdatedAt = time.Now()
		return c, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying credits: %w", err)
	}
	return c, nil
}

func (s *Store) Set(scriptID, additionalCredits string) (*Credits, error) {
	c := &Credits{
		ScriptID:          scriptID,
		AdditionalCredits: additionalCredits,
		UpdatedAt:         time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO credits (script_id, additional_credits, updated_at)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (script_id)
		 DO UPDATE SET additional_credits = EXCLUDED.additional_credits, updated_at = EXCLUDED.updated_at`,
		c.ScriptID, c.AdditionalCredits, c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving credits: %w", err)
	}
	return c, nil
}
