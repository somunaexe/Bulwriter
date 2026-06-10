// snapshot.go — version control engine
// Stores immutable script snapshots addressed by a SHA-256 content hash.
// Branches are named pointers to the latest snapshot on that line of work.
// Diff computes a human-readable Myers diff between any two snapshots.
// In production, swap the in-memory store for S3 + Postgres.
package snapshot

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ---------- Data types ----------

// Snapshot is an immutable point-in-time capture of a script's full text.
type Snapshot struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	BranchID  string    `json:"branchId"`
	Hash      string    `json:"hash"`   // SHA-256 of Content
	Content   string    `json:"content"`
	Message   string    `json:"message"` // human label e.g. "Act II rewrite"
	AuthorID  string    `json:"authorId"`
	ParentID  string    `json:"parentId"` // empty for root
	CreatedAt time.Time `json:"createdAt"`
}

// Branch is a named, mutable pointer to the tip snapshot.
type Branch struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"` // "main", "alt-ending", etc.
	TipID     string    `json:"tipId"` // ID of latest Snapshot on this branch
	CreatedAt time.Time `json:"createdAt"`
}

// DiffLine represents a single changed line in a diff.
type DiffLine struct {
	Op   string `json:"op"`   // "equal" | "insert" | "delete"
	Text string `json:"text"`
}

// ---------- Store ----------

// Store is an in-memory snapshot and branch registry.
// Replace with Postgres + S3 for production.
type Store struct {
	mu        sync.RWMutex
	snapshots map[string]*Snapshot // keyed by Snapshot.ID
	branches  map[string]*Branch   // keyed by Branch.ID
}

func NewStore() *Store {
	return &Store{
		snapshots: make(map[string]*Snapshot),
		branches:  make(map[string]*Branch),
	}
}

// ---------- Branch operations ----------

// CreateBranch initialises a new named branch for a project.
// If fromSnapshotID is provided the branch starts at that snapshot;
// otherwise it starts empty (first commit will be the root).
func (s *Store) CreateBranch(projectID, name, fromSnapshotID string) (*Branch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	b := &Branch{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Name:      name,
		TipID:     fromSnapshotID,
		CreatedAt: time.Now(),
	}
	s.branches[b.ID] = b
	return b, nil
}

// GetBranch retrieves a branch by ID.
func (s *Store) GetBranch(id string) (*Branch, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.branches[id]
	if !ok {
		return nil, errors.New("branch not found")
	}
	return b, nil
}

// ListBranches returns all branches for a project.
func (s *Store) ListBranches(projectID string) []*Branch {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Branch
	for _, b := range s.branches {
		if b.ProjectID == projectID {
			out = append(out, b)
		}
	}
	return out
}

// ---------- Snapshot operations ----------

// Commit saves a new immutable snapshot and advances the branch tip.
func (s *Store) Commit(projectID, branchID, content, message, authorID string) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	branch, ok := s.branches[branchID]
	if !ok {
		return nil, errors.New("branch not found")
	}
	if branch.ProjectID != projectID {
		return nil, errors.New("branch does not belong to project")
	}

	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	snap := &Snapshot{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		BranchID:  branchID,
		Hash:      hash,
		Content:   content,
		Message:   message,
		AuthorID:  authorID,
		ParentID:  branch.TipID,
		CreatedAt: time.Now(),
	}

	s.snapshots[snap.ID] = snap
	branch.TipID = snap.ID
	return snap, nil
}

// GetSnapshot retrieves a snapshot by ID.
func (s *Store) GetSnapshot(id string) (*Snapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snap, ok := s.snapshots[id]
	if !ok {
		return nil, errors.New("snapshot not found")
	}
	return snap, nil
}

// History returns the linear ancestry of a snapshot back to the root.
func (s *Store) History(tipID string) ([]*Snapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var chain []*Snapshot
	id := tipID
	for id != "" {
		snap, ok := s.snapshots[id]
		if !ok {
			break
		}
		chain = append(chain, snap)
		id = snap.ParentID
	}
	return chain, nil
}

// ---------- Diff ----------

// Diff computes a line-level Myers diff between two snapshots.
// Returns a slice of DiffLine with op "equal", "insert", or "delete".
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

// lineDiff is a simple line-level diff (LCS-based).
// For production quality use the go-diff Myers implementation.
func lineDiff(a, b string) []DiffLine {
	aLines := strings.Split(a, "\n")
	bLines := strings.Split(b, "\n")

	// Build LCS table.
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
