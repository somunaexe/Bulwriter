package budget

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Estimate holds a script's per-unit rates — multiplied against counts
// already derivable from the scene breakdown/schedule (shoot days,
// unique locations, unique cast, unique props) on the frontend, which is
// also where the running total is computed. The backend just stores the
// rates and line items; it has no opinion on the counts themselves.
type Estimate struct {
	ScriptID     string    `json:"scriptId"`
	DayRate      float64   `json:"dayRate"`
	LocationRate float64   `json:"locationRate"`
	CastRate     float64   `json:"castRate"`
	PropRate     float64   `json:"propRate"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// LineItem is a freeform cost that doesn't map to a derived count —
// insurance, post-production, catering, whatever the production needs to
// account for that the rates above can't capture.
type LineItem struct {
	ID        string    `json:"id"`
	ScriptID  string    `json:"scriptId"`
	Label     string    `json:"label"`
	Amount    float64   `json:"amount"`
	Position  int       `json:"position"`
	// Linked is true when this item was added from a highlighted script
	// selection rather than typed in freeform — the frontend uses it to
	// decide whether a "show in script" jump makes sense for the row.
	// The anchor itself is a budget_item mark in the script's own doc,
	// keyed by this row's ID; nothing here tracks its live position.
	Linked    bool      `json:"linked"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// GetEstimate returns the script's saved rates, or all-zero defaults if
// none have been saved yet — there's nothing to error on, an unrated
// script just starts at $0 across the board.
func (s *Store) GetEstimate(scriptID string) (*Estimate, error) {
	e := &Estimate{ScriptID: scriptID}
	err := s.db.QueryRow(
		`SELECT day_rate, location_rate, cast_rate, prop_rate, updated_at
		 FROM budget_estimates WHERE script_id = $1`, scriptID,
	).Scan(&e.DayRate, &e.LocationRate, &e.CastRate, &e.PropRate, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		e.UpdatedAt = time.Now()
		return e, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying budget estimate: %w", err)
	}
	return e, nil
}

func (s *Store) SetEstimate(scriptID string, dayRate, locationRate, castRate, propRate float64) (*Estimate, error) {
	e := &Estimate{
		ScriptID:     scriptID,
		DayRate:      dayRate,
		LocationRate: locationRate,
		CastRate:     castRate,
		PropRate:     propRate,
		UpdatedAt:    time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO budget_estimates (script_id, day_rate, location_rate, cast_rate, prop_rate, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (script_id)
		 DO UPDATE SET day_rate = EXCLUDED.day_rate, location_rate = EXCLUDED.location_rate,
		               cast_rate = EXCLUDED.cast_rate, prop_rate = EXCLUDED.prop_rate,
		               updated_at = EXCLUDED.updated_at`,
		e.ScriptID, e.DayRate, e.LocationRate, e.CastRate, e.PropRate, e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving budget estimate: %w", err)
	}
	return e, nil
}

func (s *Store) ListLineItems(scriptID string) ([]*LineItem, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, label, amount, position, linked, created_at
		 FROM budget_line_items WHERE script_id = $1
		 ORDER BY position ASC, created_at ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying line items: %w", err)
	}
	defer rows.Close()

	var out []*LineItem
	for rows.Next() {
		li := &LineItem{}
		if err := rows.Scan(&li.ID, &li.ScriptID, &li.Label, &li.Amount, &li.Position, &li.Linked, &li.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning line item: %w", err)
		}
		out = append(out, li)
	}
	return out, rows.Err()
}

func (s *Store) AddLineItem(scriptID, label string, amount float64, linked bool) (*LineItem, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM budget_line_items WHERE script_id = $1`, scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing line item position: %w", err)
	}

	li := &LineItem{
		ID:        uuid.New().String(),
		ScriptID:  scriptID,
		Label:     label,
		Amount:    amount,
		Position:  nextPosition,
		Linked:    linked,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO budget_line_items (id, script_id, label, amount, position, linked, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		li.ID, li.ScriptID, li.Label, li.Amount, li.Position, li.Linked, li.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting line item: %w", err)
	}
	return li, nil
}

func (s *Store) RemoveLineItem(scriptID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM budget_line_items WHERE id = $1 AND script_id = $2`, id, scriptID,
	)
	if err != nil {
		return fmt.Errorf("removing line item: %w", err)
	}
	return nil
}
