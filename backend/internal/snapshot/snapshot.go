package snapshot

import (
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Branch and Snapshot types stay exactly the same as before.
// The rest of the app depends on these — we never change them.

type Branch struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	TipID     string    `json:"tipId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Snapshot struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	BranchID  string    `json:"branchId"`
	Hash      string    `json:"hash"`
	Content   string    `json:"content"`
	Message   string    `json:"message"`
	AuthorID  string    `json:"authorId"`
	ParentID  string    `json:"parentId"`
	CreatedAt time.Time `json:"createdAt"`
}

type DiffLine struct {
	Op   string `json:"op"`
	Text string `json:"text"`
}

// Store now holds a *sql.DB instead of in-memory maps.
// The mutex is gone — Postgres handles concurrency for us.
type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// ── Branches ──────────────────────────────────────────────────────────────

func (s *Store) CreateBranch(projectID, name, fromSnapshotID string) (*Branch, error) {
	b := &Branch{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Name:      name,
		TipID:     fromSnapshotID,
		CreatedAt: time.Now(),
	}

	// INSERT ... RETURNING created_at lets Postgres echo back the value
	// it stored, so our struct reflects exactly what's in the database.
	_, err := s.db.Exec(
		`INSERT INTO branches (id, project_id, name, tip_id, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		b.ID, b.ProjectID, b.Name, b.TipID, b.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting branch: %w", err)
	}
	return b, nil
}

func (s *Store) GetBranch(id string) (*Branch, error) {
	b := &Branch{}
	err := s.db.QueryRow(
		`SELECT id, project_id, name, tip_id, created_at
		 FROM branches WHERE id = $1`, id,
	).Scan(&b.ID, &b.ProjectID, &b.Name, &b.TipID, &b.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("branch not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying branch: %w", err)
	}
	return b, nil
}

func (s *Store) ListBranches(projectID string) ([]*Branch, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, name, tip_id, created_at
		 FROM branches WHERE project_id = $1
		 ORDER BY created_at ASC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying branches: %w", err)
	}
	// defer rows.Close() is important — if you forget it the connection
	// is held open and eventually you run out of connections in the pool.
	defer rows.Close()

	var branches []*Branch
	for rows.Next() {
		b := &Branch{}
		if err := rows.Scan(&b.ID, &b.ProjectID, &b.Name, &b.TipID, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning branch: %w", err)
		}
		branches = append(branches, b)
	}
	return branches, rows.Err()
}

// updateBranchTip is an internal helper — moves the branch pointer forward
// after a new commit. Only called from within Commit().
func (s *Store) updateBranchTip(branchID, snapshotID string) error {
	_, err := s.db.Exec(
		`UPDATE branches SET tip_id = $1 WHERE id = $2`,
		snapshotID, branchID,
	)
	return err
}

// ── Snapshots ─────────────────────────────────────────────────────────────

func (s *Store) Commit(projectID, branchID, content, message, authorID string) (*Snapshot, error) {
	// First verify the branch exists and belongs to this project.
	branch, err := s.GetBranch(branchID)
	if err != nil {
		return nil, err
	}
	if branch.ProjectID != projectID {
		return nil, errors.New("branch does not belong to project")
	}

	snap := &Snapshot{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		BranchID:  branchID,
		Hash:      fmt.Sprintf("%x", sha256.Sum256([]byte(content))),
		Content:   content,
		Message:   message,
		AuthorID:  authorID,
		ParentID:  branch.TipID, // current tip becomes this snapshot's parent
		CreatedAt: time.Now(),
	}

	// We use a transaction here because two things must happen together:
	// insert the snapshot AND update the branch tip. If either fails,
	// both are rolled back — the database never ends up in a half-updated state.
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback() // no-op if tx.Commit() already succeeded

	_, err = tx.Exec(
		`INSERT INTO snapshots
		 (id, project_id, branch_id, hash, content, message, author_id, parent_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		snap.ID, snap.ProjectID, snap.BranchID, snap.Hash,
		snap.Content, snap.Message, snap.AuthorID, snap.ParentID, snap.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting snapshot: %w", err)
	}

	_, err = tx.Exec(
		`UPDATE branches SET tip_id = $1 WHERE id = $2`,
		snap.ID, branchID,
	)
	if err != nil {
		return nil, fmt.Errorf("updating branch tip: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}

	return snap, nil
}

func (s *Store) GetSnapshot(id string) (*Snapshot, error) {
	snap := &Snapshot{}
	err := s.db.QueryRow(
		`SELECT id, project_id, branch_id, hash, content, message, author_id, parent_id, created_at
		 FROM snapshots WHERE id = $1`, id,
	).Scan(
		&snap.ID, &snap.ProjectID, &snap.BranchID, &snap.Hash,
		&snap.Content, &snap.Message, &snap.AuthorID, &snap.ParentID, &snap.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("snapshot not found")
	}
	if err != nil {
		return nil, fmt.Errorf("querying snapshot: %w", err)
	}
	return snap, nil
}

func (s *Store) History(tipID string) ([]*Snapshot, error) {
	// This query uses a recursive CTE (Common Table Expression).
	// It starts at the tip snapshot and follows parent_id links
	// back to the root — exactly like git log. Without recursion
	// you'd need one query per snapshot, which gets slow fast.
	rows, err := s.db.Query(`
		WITH RECURSIVE chain AS (
			SELECT * FROM snapshots WHERE id = $1
			UNION ALL
			SELECT s.* FROM snapshots s
			INNER JOIN chain c ON s.id = c.parent_id
		)
		SELECT id, project_id, branch_id, hash, content, message, author_id, parent_id, created_at
		FROM chain
		ORDER BY created_at DESC`, tipID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying history: %w", err)
	}
	defer rows.Close()

	var chain []*Snapshot
	for rows.Next() {
		snap := &Snapshot{}
		if err := rows.Scan(
			&snap.ID, &snap.ProjectID, &snap.BranchID, &snap.Hash,
			&snap.Content, &snap.Message, &snap.AuthorID, &snap.ParentID, &snap.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning snapshot: %w", err)
		}
		chain = append(chain, snap)
	}
	return chain, rows.Err()
}

// ── Diff ──────────────────────────────────────────────────────────────────

func (s *Store) Diff(fromID, toID string) ([]DiffLine, error) {
	from, err := s.GetSnapshot(fromID)
	if err != nil {
		return nil, fmt.Errorf("from snapshot: %w", err)
	}
	to, err := s.GetSnapshot(toID)
	if err != nil {
		return nil, fmt.Errorf("to snapshot: %w", err)
	}
	return lineDiff(from.Content, to.Content), nil
}

func lineDiff(a, b string) []DiffLine {
	aLines := strings.Split(a, "\n")
	bLines := strings.Split(b, "\n")
	m, n := len(aLines), len(bLines)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := m - 1; i >= 0; i-- {
		for j := n - 1; j >= 0; j-- {
			if aLines[i] == bLines[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] > dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	var result []DiffLine
	i, j := 0, 0
	for i < m && j < n {
		if aLines[i] == bLines[j] {
			result = append(result, DiffLine{Op: "equal", Text: aLines[i]})
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			result = append(result, DiffLine{Op: "delete", Text: aLines[i]})
			i++
		} else {
			result = append(result, DiffLine{Op: "insert", Text: bLines[j]})
			j++
		}
	}
	for ; i < m; i++ {
		result = append(result, DiffLine{Op: "delete", Text: aLines[i]})
	}
	for ; j < n; j++ {
		result = append(result, DiffLine{Op: "insert", Text: bLines[j]})
	}
	return result
}