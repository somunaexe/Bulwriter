package script

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Script struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) Create(projectID, title string) (*Script, error) {
	sc := &Script{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Title:     title,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO scripts (id, project_id, title, created_at)
		 VALUES ($1, $2, $3, $4)`,
		sc.ID, sc.ProjectID, sc.Title, sc.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting script: %w", err)
	}
	return sc, nil
}

func (s *Store) List(projectID string) ([]*Script, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, title, created_at
		 FROM scripts WHERE project_id = $1
		 ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying scripts: %w", err)
	}
	defer rows.Close()

	var scripts []*Script
	for rows.Next() {
		sc := &Script{}
		if err := rows.Scan(&sc.ID, &sc.ProjectID, &sc.Title, &sc.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning script: %w", err)
		}
		scripts = append(scripts, sc)
	}
	return scripts, rows.Err()
}

func (s *Store) Get(id string) (*Script, error) {
	sc := &Script{}
	err := s.db.QueryRow(
		`SELECT id, project_id, title, created_at
		 FROM scripts WHERE id = $1`, id,
	).Scan(&sc.ID, &sc.ProjectID, &sc.Title, &sc.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("script not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying script: %w", err)
	}
	return sc, nil
}