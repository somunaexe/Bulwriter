package donation

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Donation struct {
	ID          string    `json:"id"`
	AmountCents int       `json:"amountCents"`
	Currency    string    `json:"currency"`
	Interval    string    `json:"interval"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// RecordCompleted persists a Stripe-confirmed successful checkout —
// called only from the webhook handler once Stripe's signature has
// verified the event actually came from Stripe. Idempotent: Stripe
// retries webhook delivery on anything but a 2xx response, so a repeat
// delivery for the same session is treated as success, not an error.
func (s *Store) RecordCompleted(c CompletedCheckout) error {
	_, err := s.db.Exec(
		`INSERT INTO donations (id, stripe_session_id, amount_cents, currency, interval)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (stripe_session_id) DO NOTHING`,
		uuid.New().String(), c.SessionID, c.AmountCents, c.Currency, c.Interval,
	)
	if err != nil {
		return fmt.Errorf("recording donation: %w", err)
	}
	return nil
}
