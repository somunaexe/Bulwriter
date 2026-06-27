package membership

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Member struct {
	ProjectID string    `json:"projectId"`
	UserID    string    `json:"userId"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joinedAt"`
}

type Invite struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) AddMember(projectID, userID, role string) error {
	_, err := s.db.Exec(
		`INSERT INTO project_members (project_id, user_id, role, joined_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (project_id, user_id) DO NOTHING`,
		projectID, userID, role, time.Now(),
	)
	if err != nil {
		return fmt.Errorf("adding member: %w", err)
	}
	return nil
}

func (s *Store) IsMember(projectID, userID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM project_members
			WHERE project_id = $1 AND user_id = $2
		)`, projectID, userID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) ProjectIDsForUser(userID string) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT project_id FROM project_members WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying memberships: %w", err)
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

func (s *Store) ListMembers(projectID string) ([]*Member, error) {
	rows, err := s.db.Query(
		`SELECT project_id, user_id, role, joined_at
		 FROM project_members WHERE project_id = $1
		 ORDER BY joined_at ASC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying members: %w", err)
	}
	defer rows.Close()

	var members []*Member
	for rows.Next() {
		m := &Member{}
		if err := rows.Scan(&m.ProjectID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (s *Store) GetRole(projectID, userID string) (string, error) {
	var role string
	err := s.db.QueryRow(
		`SELECT role FROM project_members
		 WHERE project_id = $1 AND user_id = $2`,
		projectID, userID,
	).Scan(&role)

	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("querying role: %w", err)
	}
	return role, nil
}

func (s *Store) CreateInvite(projectID, email, role string) (*Invite, error) {
	inv := &Invite{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Email:     email,
		Role:      role,
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO project_invites (id, project_id, email, role, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		inv.ID, inv.ProjectID, inv.Email, inv.Role, inv.Status, inv.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("creating invite: %w", err)
	}
	return inv, nil
}

func (s *Store) ListInvites(projectID string) ([]*Invite, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, email, role, status, created_at
		 FROM project_invites WHERE project_id = $1
		 ORDER BY created_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying invites: %w", err)
	}
	defer rows.Close()

	var invites []*Invite
	for rows.Next() {
		inv := &Invite{}
		if err := rows.Scan(&inv.ID, &inv.ProjectID, &inv.Email, &inv.Role, &inv.Status, &inv.CreatedAt); err != nil {
			return nil, err
		}
		invites = append(invites, inv)
	}
	return invites, rows.Err()
}

func (s *Store) AcceptPendingInvites(userID, email string) error {
	rows, err := s.db.Query(
		`SELECT id, project_id, role FROM project_invites
		 WHERE email = $1 AND status = 'pending'`, email,
	)
	if err != nil {
		return fmt.Errorf("querying pending invites: %w", err)
	}

	type pending struct {
		id, projectID, role string
	}
	var toAccept []pending

	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.projectID, &p.role); err != nil {
			rows.Close()
			return err
		}
		toAccept = append(toAccept, p)
	}
	rows.Close()

	for _, p := range toAccept {
		if err := s.AddMember(p.projectID, userID, p.role); err != nil {
			return err
		}
		_, err := s.db.Exec(
			`UPDATE project_invites SET status = 'accepted' WHERE id = $1`, p.id,
		)
		if err != nil {
			return err
		}
	}
	return nil
}