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
	ID        string     `json:"id"`
	Title     string     `json:"title"` // renamed from Name
	OwnerID   string     `json:"ownerId"`
	CreatedAt time.Time  `json:"createdAt"`
	DeletedAt *time.Time `json:"deletedAt,omitempty"`
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
		`SELECT id, title, owner_id, created_at, deleted_at
		 FROM projects WHERE owner_id = $1 AND deleted_at IS NULL
		 ORDER BY created_at DESC`, ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying projects: %w", err)
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt, &p.DeletedAt); err != nil {
			return nil, fmt.Errorf("scanning project: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (s *Store) Get(id string) (*Project, error) {
	p := &Project{}
	err := s.db.QueryRow(
		`SELECT id, title, owner_id, created_at, deleted_at
		 FROM projects WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt, &p.DeletedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("project not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying project: %w", err)
	}
	return p, nil
}

// Rename updates a project's title.
func (s *Store) Rename(id, title string) error {
	res, err := s.db.Exec(
		`UPDATE projects SET title = $1 WHERE id = $2 AND deleted_at IS NULL`, title, id,
	)
	if err != nil {
		return fmt.Errorf("renaming project: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("project not found")
	}
	return nil
}

// IsTrashed reports whether a project is currently soft-deleted — used to
// guard permanent deletion (PurgeProjectNow in internal/trash) so a live
// project can never be purged by mistake.
func (s *Store) IsTrashed(id string) (bool, error) {
	var deletedAt sql.NullTime
	err := s.db.QueryRow(`SELECT deleted_at FROM projects WHERE id = $1`, id).Scan(&deletedAt)
	if err == sql.ErrNoRows {
		return false, errors.New("project not found")
	}
	if err != nil {
		return false, fmt.Errorf("checking project trash state: %w", err)
	}
	return deletedAt.Valid, nil
}

// SoftDelete moves a project to the trash — it stops showing up in normal
// listings but stays fully intact and restorable until the periodic purge
// job (see internal/trash) permanently removes it.
func (s *Store) SoftDelete(id string) error {
	res, err := s.db.Exec(
		`UPDATE projects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("soft-deleting project: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("project not found")
	}
	return nil
}

// Restore takes a project back out of the trash.
func (s *Store) Restore(id string) error {
	res, err := s.db.Exec(
		`UPDATE projects SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`, id,
	)
	if err != nil {
		return fmt.Errorf("restoring project: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("project not found in trash")
	}
	return nil
}

// ListTrashByIDs returns soft-deleted projects matching any of the given
// IDs, most recently deleted first — same ID-set shape as ListByIDs, since
// trashing a project doesn't touch its membership rows.
func (s *Store) ListTrashByIDs(ids []string) ([]*Project, error) {
	if len(ids) == 0 {
		return []*Project{}, nil
	}

	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT id, title, owner_id, created_at, deleted_at FROM projects
		 WHERE id IN (%s) AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
		strings.Join(placeholders, ","),
	)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("querying trashed projects: %w", err)
	}
	defer rows.Close()

	var projects []*Project
	for rows.Next() {
		p := &Project{}
		if err := rows.Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt, &p.DeletedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// ExpiredIDs returns IDs of projects that have been in the trash longer
// than the retention window — used by the periodic purge job.
func (s *Store) ExpiredIDs(cutoff time.Time) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < $1`, cutoff,
	)
	if err != nil {
		return nil, fmt.Errorf("querying expired projects: %w", err)
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

// Purge permanently deletes the project row itself. Callers are
// responsible for first purging everything that depends on it (scripts
// and project-scoped data) — see internal/trash, which is the only
// intended caller.
func (s *Store) Purge(id string) error {
	if _, err := s.db.Exec(`DELETE FROM projects WHERE id = $1`, id); err != nil {
		return fmt.Errorf("purging project: %w", err)
	}
	return nil
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
		`SELECT id, title, owner_id, created_at, deleted_at FROM projects
		 WHERE id IN (%s) AND deleted_at IS NULL ORDER BY created_at DESC`,
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
		if err := rows.Scan(&p.ID, &p.Title, &p.OwnerID, &p.CreatedAt, &p.DeletedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}
