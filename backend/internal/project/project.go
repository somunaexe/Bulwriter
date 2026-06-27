package project

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Project struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`  // renamed from Name
	OwnerID   string    `json:"ownerId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Create(title, ownerID string) (*Project, error) {
	p := &Project{
		ID:        uuid.New().String(),
		Title:     title,
		OwnerID:   ownerID,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO projects (id, title, owner_id, created_at)
		 VALUES ($1, $2, $3, $4)`,
		p.ID, p.Title, p.OwnerID, p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting project: %w", err)
	}
	return p, nil
}

func (s *Store) List(ownerID string) ([]*Project, error) {
	rows, err := s.db.Query(
		`SELECT id, title, owner_id, created_at
		 FROM projects WHERE owner_id = $1
		 ORDER BY created_at DESC`, ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying projects: %w", err)
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning project: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (s *Store) Get(id string) (*Project, error) {
	p := &Project{}
	err := s.db.QueryRow(
		`SELECT id, title, owner_id, created_at
		 FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("project not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying project: %w", err)
	}
	return p, nil
}

// ListByIDs returns projects matching any of the given IDs.
// Used alongside membership.ProjectIDsForUser — the handler first
// gets the list of project IDs the user belongs to, then fetches
// those projects' details here.
func (s *Store) ListByIDs(ids []string) ([]*Project, error) {
	if len(ids) == 0 {
		return []*Project{}, nil
	}

	// Postgres doesn't have a direct "WHERE id IN (slice)" with the
	// standard library — we build the placeholder list manually.
	// $1, $2, $3... one per ID.
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT id, title, owner_id, created_at FROM projects
		 WHERE id IN (%s) ORDER BY created_at DESC`,
		strings.Join(placeholders, ","),
	)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("querying projects: %w", err)
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}