package distribution

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// FestivalSubmission is one festival a script has been (or will be)
// submitted to — deadline, fee, and a simple submission status, plus
// a premiere-required flag (many top festivals require a world/
// national premiere, which rules out submitting elsewhere first) and
// freeform notes for results, feedback, or awards.
type FestivalSubmission struct {
	ID               string    `json:"id"`
	ScriptID         string    `json:"scriptId"`
	FestivalName     string    `json:"festivalName"`
	Deadline         string    `json:"deadline"`
	Fee              float64   `json:"fee"`
	Status           string    `json:"status"` // "planned" | "submitted" | "accepted" | "rejected" | "withdrawn"
	PremiereRequired bool      `json:"premiereRequired"`
	Notes            string    `json:"notes"`
	Position         int       `json:"position"`
	CreatedAt        time.Time `json:"createdAt"`
}

// ReleaseLink is one place the finished film is (or will be) released
// — a platform name, a URL, and a release date.
type ReleaseLink struct {
	ID          string    `json:"id"`
	ScriptID    string    `json:"scriptId"`
	Platform    string    `json:"platform"`
	URL         string    `json:"url"`
	ReleaseDate string    `json:"releaseDate"`
	Notes       string    `json:"notes"`
	Position    int       `json:"position"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// ── Festival submissions ─────────────────────────────────────────────

func (s *Store) ListFestivals(scriptID string) ([]*FestivalSubmission, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, festival_name, deadline, fee, status, premiere_required, notes, position, created_at
		 FROM festival_submissions WHERE script_id = $1
		 ORDER BY position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying festival submissions: %w", err)
	}
	defer rows.Close()

	var out []*FestivalSubmission
	for rows.Next() {
		f := &FestivalSubmission{}
		if err := rows.Scan(
			&f.ID, &f.ScriptID, &f.FestivalName, &f.Deadline, &f.Fee, &f.Status, &f.PremiereRequired, &f.Notes, &f.Position, &f.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning festival submission: %w", err)
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) AddFestival(scriptID, festivalName, deadline string, fee float64, status string, premiereRequired bool, notes string) (*FestivalSubmission, error) {
	if status == "" {
		status = "planned"
	}

	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM festival_submissions WHERE script_id = $1`, scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing festival submission position: %w", err)
	}

	f := &FestivalSubmission{
		ID:               uuid.New().String(),
		ScriptID:         scriptID,
		FestivalName:     festivalName,
		Deadline:         deadline,
		Fee:              fee,
		Status:           status,
		PremiereRequired: premiereRequired,
		Notes:            notes,
		Position:         nextPosition,
		CreatedAt:        time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO festival_submissions (id, script_id, festival_name, deadline, fee, status, premiere_required, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		f.ID, f.ScriptID, f.FestivalName, f.Deadline, f.Fee, f.Status, f.PremiereRequired, f.Notes, f.Position, f.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting festival submission: %w", err)
	}
	return f, nil
}

func (s *Store) UpdateFestival(scriptID, id, festivalName, deadline string, fee float64, status string, premiereRequired bool, notes string) (*FestivalSubmission, error) {
	_, err := s.db.Exec(
		`UPDATE festival_submissions SET festival_name = $1, deadline = $2, fee = $3, status = $4, premiere_required = $5, notes = $6
		 WHERE id = $7 AND script_id = $8`,
		festivalName, deadline, fee, status, premiereRequired, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating festival submission: %w", err)
	}
	return &FestivalSubmission{
		ID: id, ScriptID: scriptID, FestivalName: festivalName, Deadline: deadline,
		Fee: fee, Status: status, PremiereRequired: premiereRequired, Notes: notes,
	}, nil
}

func (s *Store) RemoveFestival(scriptID, id string) error {
	_, err := s.db.Exec(`DELETE FROM festival_submissions WHERE id = $1 AND script_id = $2`, id, scriptID)
	if err != nil {
		return fmt.Errorf("removing festival submission: %w", err)
	}
	return nil
}

// ── Release links ──────────────────────────────────────────────────

func (s *Store) ListReleaseLinks(scriptID string) ([]*ReleaseLink, error) {
	rows, err := s.db.Query(
		`SELECT id, script_id, platform, url, release_date, notes, position, created_at
		 FROM release_links WHERE script_id = $1
		 ORDER BY position ASC`, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying release links: %w", err)
	}
	defer rows.Close()

	var out []*ReleaseLink
	for rows.Next() {
		l := &ReleaseLink{}
		if err := rows.Scan(&l.ID, &l.ScriptID, &l.Platform, &l.URL, &l.ReleaseDate, &l.Notes, &l.Position, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning release link: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) AddReleaseLink(scriptID, platform, url, releaseDate, notes string) (*ReleaseLink, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM release_links WHERE script_id = $1`, scriptID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing release link position: %w", err)
	}

	l := &ReleaseLink{
		ID:          uuid.New().String(),
		ScriptID:    scriptID,
		Platform:    platform,
		URL:         url,
		ReleaseDate: releaseDate,
		Notes:       notes,
		Position:    nextPosition,
		CreatedAt:   time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO release_links (id, script_id, platform, url, release_date, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		l.ID, l.ScriptID, l.Platform, l.URL, l.ReleaseDate, l.Notes, l.Position, l.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting release link: %w", err)
	}
	return l, nil
}

func (s *Store) UpdateReleaseLink(scriptID, id, platform, url, releaseDate, notes string) (*ReleaseLink, error) {
	_, err := s.db.Exec(
		`UPDATE release_links SET platform = $1, url = $2, release_date = $3, notes = $4
		 WHERE id = $5 AND script_id = $6`,
		platform, url, releaseDate, notes, id, scriptID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating release link: %w", err)
	}
	return &ReleaseLink{ID: id, ScriptID: scriptID, Platform: platform, URL: url, ReleaseDate: releaseDate, Notes: notes}, nil
}

func (s *Store) RemoveReleaseLink(scriptID, id string) error {
	_, err := s.db.Exec(`DELETE FROM release_links WHERE id = $1 AND script_id = $2`, id, scriptID)
	if err != nil {
		return fmt.Errorf("removing release link: %w", err)
	}
	return nil
}
