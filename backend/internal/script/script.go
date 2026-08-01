package script

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Script struct {
	ID        string     `json:"id"`
	ProjectID string     `json:"projectId"`
	Title     string     `json:"title"`
	CreatedAt time.Time  `json:"createdAt"`
	DeletedAt *time.Time `json:"deletedAt,omitempty"`
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
		`SELECT id, project_id, title, created_at, deleted_at
		 FROM scripts WHERE project_id = $1 AND deleted_at IS NULL
		 ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying scripts: %w", err)
	}
	defer rows.Close()

	var scripts []*Script
	for rows.Next() {
		sc := &Script{}
		if err := rows.Scan(&sc.ID, &sc.ProjectID, &sc.Title, &sc.CreatedAt, &sc.DeletedAt); err != nil {
			return nil, fmt.Errorf("scanning script: %w", err)
		}
		scripts = append(scripts, sc)
	}
	return scripts, rows.Err()
}

func (s *Store) Get(id string) (*Script, error) {
	sc := &Script{}
	err := s.db.QueryRow(
		`SELECT id, project_id, title, created_at, deleted_at
		 FROM scripts WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&sc.ID, &sc.ProjectID, &sc.Title, &sc.CreatedAt, &sc.DeletedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("script not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying script: %w", err)
	}
	return sc, nil
}

// SoftDelete moves a script to the trash — see project.Store.SoftDelete
// for the equivalent at the project level.
func (s *Store) SoftDelete(id string) error {
	res, err := s.db.Exec(
		`UPDATE scripts SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("soft-deleting script: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("script not found")
	}
	return nil
}

// Restore takes a script back out of the trash.
func (s *Store) Restore(id string) error {
	res, err := s.db.Exec(
		`UPDATE scripts SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("restoring script: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("script not found in trash")
	}
	return nil
}

// ListTrash returns a project's soft-deleted scripts, most recently
// deleted first.
func (s *Store) ListTrash(projectID string) ([]*Script, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, title, created_at, deleted_at
		 FROM scripts WHERE project_id = $1 AND deleted_at IS NOT NULL
		 ORDER BY deleted_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying trashed scripts: %w", err)
	}
	defer rows.Close()

	var scripts []*Script
	for rows.Next() {
		sc := &Script{}
		if err := rows.Scan(&sc.ID, &sc.ProjectID, &sc.Title, &sc.CreatedAt, &sc.DeletedAt); err != nil {
			return nil, err
		}
		scripts = append(scripts, sc)
	}
	return scripts, rows.Err()
}

// ExpiredIDs returns IDs of scripts that have been in the trash longer
// than the retention window — used by the periodic purge job.
func (s *Store) ExpiredIDs(cutoff time.Time) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT id FROM scripts WHERE deleted_at IS NOT NULL AND deleted_at < $1`, cutoff,
	)
	if err != nil {
		return nil, fmt.Errorf("querying expired scripts: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// AllIDsForProject returns every script under a project regardless of
// trash state — used when a project itself is permanently purged, since
// every script it contains must go with it whether or not each one was
// individually trashed first.
func (s *Store) AllIDsForProject(projectID string) ([]string, error) {
	rows, err := s.db.Query(`SELECT id FROM scripts WHERE project_id = $1`, projectID)
	if err != nil {
		return nil, fmt.Errorf("querying project scripts: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Purge permanently deletes the script row itself. Callers are
// responsible for first purging its dependent production data — see
// internal/trash, which is the only intended caller.
func (s *Store) Purge(id string) error {
	if _, err := s.db.Exec(`DELETE FROM scripts WHERE id = $1`, id); err != nil {
		return fmt.Errorf("purging script: %w", err)
	}
	return nil
}