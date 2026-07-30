package story

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Bible holds the creative fields shared across every script in a
// project — genre/tone/theme/core question rarely differ episode to
// episode within the same series, so these live once at the project
// level rather than being duplicated per script.
type Bible struct {
	ProjectID    string    `json:"projectId"`
	CoreQuestion string    `json:"coreQuestion"`
	Genre        string    `json:"genre"`
	Tone         string    `json:"tone"`
	Theme        string    `json:"theme"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// IdeaNote is one freeform, unfiltered entry in the project's idea
// dump — deliberately a growing list rather than a single overwritable
// field, so an early version of an idea is never lost to a later one.
type IdeaNote struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Text      string    `json:"text"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
}

// ScriptStory is the logline/synopsis for one script (episode) — the
// one part of the story bible that IS specific per script, mapped
// against the project's shared genre/tone/theme.
type ScriptStory struct {
	ScriptID  string    `json:"scriptId"`
	Logline   string    `json:"logline"`
	Synopsis  string    `json:"synopsis"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// GetBible returns the project's saved bible fields, or all-blank
// defaults if none have been saved yet.
func (s *Store) GetBible(projectID string) (*Bible, error) {
	b := &Bible{ProjectID: projectID}
	err := s.db.QueryRow(
		`SELECT core_question, genre, tone, theme, updated_at
		 FROM story_bibles WHERE project_id = $1`, projectID,
	).Scan(&b.CoreQuestion, &b.Genre, &b.Tone, &b.Theme, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		b.UpdatedAt = time.Now()
		return b, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying story bible: %w", err)
	}
	return b, nil
}

func (s *Store) SetBible(projectID, coreQuestion, genre, tone, theme string) (*Bible, error) {
	b := &Bible{
		ProjectID:    projectID,
		CoreQuestion: coreQuestion,
		Genre:        genre,
		Tone:         tone,
		Theme:        theme,
		UpdatedAt:    time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO story_bibles (project_id, core_question, genre, tone, theme, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (project_id)
		 DO UPDATE SET core_question = EXCLUDED.core_question, genre = EXCLUDED.genre,
		               tone = EXCLUDED.tone, theme = EXCLUDED.theme, updated_at = EXCLUDED.updated_at`,
		b.ProjectID, b.CoreQuestion, b.Genre, b.Tone, b.Theme, b.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving story bible: %w", err)
	}
	return b, nil
}

func (s *Store) ListIdeaNotes(projectID string) ([]*IdeaNote, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, text, position, created_at
		 FROM story_idea_notes WHERE project_id = $1
		 ORDER BY position ASC, created_at ASC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying idea notes: %w", err)
	}
	defer rows.Close()

	var out []*IdeaNote
	for rows.Next() {
		n := &IdeaNote{}
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.Text, &n.Position, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning idea note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) AddIdeaNote(projectID, text string) (*IdeaNote, error) {
	var nextPosition int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position) + 1, 0) FROM story_idea_notes WHERE project_id = $1`, projectID,
	).Scan(&nextPosition); err != nil {
		return nil, fmt.Errorf("computing idea note position: %w", err)
	}

	n := &IdeaNote{
		ID:        uuid.New().String(),
		ProjectID: projectID,
		Text:      text,
		Position:  nextPosition,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO story_idea_notes (id, project_id, text, position, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		n.ID, n.ProjectID, n.Text, n.Position, n.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("inserting idea note: %w", err)
	}
	return n, nil
}

func (s *Store) RemoveIdeaNote(projectID, id string) error {
	_, err := s.db.Exec(
		`DELETE FROM story_idea_notes WHERE id = $1 AND project_id = $2`, id, projectID,
	)
	if err != nil {
		return fmt.Errorf("removing idea note: %w", err)
	}
	return nil
}

// ListScriptStories returns the logline/synopsis for every script in the
// project that has one saved — scripts with nothing saved yet are
// simply absent, left for the caller to pair against the full script
// list and fill in blanks.
func (s *Store) ListScriptStories(projectID string) ([]*ScriptStory, error) {
	rows, err := s.db.Query(
		`SELECT ss.script_id, ss.logline, ss.synopsis, ss.updated_at
		 FROM script_stories ss
		 JOIN scripts sc ON sc.id = ss.script_id
		 WHERE sc.project_id = $1`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("querying script stories: %w", err)
	}
	defer rows.Close()

	var out []*ScriptStory
	for rows.Next() {
		ss := &ScriptStory{}
		if err := rows.Scan(&ss.ScriptID, &ss.Logline, &ss.Synopsis, &ss.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning script story: %w", err)
		}
		out = append(out, ss)
	}
	return out, rows.Err()
}

func (s *Store) SetScriptStory(scriptID, logline, synopsis string) (*ScriptStory, error) {
	ss := &ScriptStory{
		ScriptID:  scriptID,
		Logline:   logline,
		Synopsis:  synopsis,
		UpdatedAt: time.Now(),
	}
	_, err := s.db.Exec(
		`INSERT INTO script_stories (script_id, logline, synopsis, updated_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (script_id)
		 DO UPDATE SET logline = EXCLUDED.logline, synopsis = EXCLUDED.synopsis, updated_at = EXCLUDED.updated_at`,
		ss.ScriptID, ss.Logline, ss.Synopsis, ss.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("saving script story: %w", err)
	}
	return ss, nil
}
