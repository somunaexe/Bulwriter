package crew

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Member is one below-the-line crew entry — role, name, contact, notes.
// Distinct from membership.Member: crew members aren't Bulwriter
// accounts, just contact info for people on the production.
type Member struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Role      string    `json:"role"`
	Name      string    `json:"name"`
	Contact   string    `json:"contact"`
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

func (s *Store) List(projectID string) ([]*Member, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, role, name, contact, notes, position, created_at
		 FROM crew_members WHERE project_id = $1
		 ORDER BY position ASC, created_at ASC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying crew members: %w", err)
	}
	defer rows.Close()

	var out []*Member
	for rows.Next() {
		m := &Member{}
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.Role, &m.Name, &m.Contact, &m.Notes, &m.Position, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning crew member: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Add(projectID, role, name, contact, notes string) (*Member, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM crew_members WHERE project_id = $1`, projectID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing crew member position: %w", err)
	}

	m := &Member{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Role:      role,
		Name:      name,
		Contact:   contact,
		Notes:     notes,
		Position:  nextPosition,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO crew_members (id, project_id, role, name, contact, notes, position, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		m.ID, m.ProjectID, m.Role, m.Name, m.Contact, m.Notes, m.Position, m.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting crew member: %w", err)
	}
	return m, nil
}

func (s *Store) Update(projectID, id, role, name, contact, notes string) (*Member, error) {
	res, err := s.db.Exec(
		`UPDATE crew_members SET role = $1, name = $2, contact = $3, notes = $4
		 WHERE id = $5 AND project_id = $6`,
		role, name, contact, notes, id, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating crew member: %w", err)
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return nil, fmt.Errorf("crew member not found")
	}

	m := &Member{ID: id, ProjectID: projectID, Role: role, Name: name, Contact: contact, Notes: notes}
	return m, nil
}

func (s *Store) Remove(projectID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM crew_members WHERE id = $1 AND project_id = $2`, id, projectID,
	)
	if err != nil {
		return fmt.Errorf("removing crew member: %w", err)
	}
	return nil
}
