// Package trash permanently discards projects and scripts that have sat
// soft-deleted (see project.Store.SoftDelete / script.Store.SoftDelete)
// longer than RetentionPeriod. The schema has no foreign keys or cascading
// deletes anywhere (every migration uses plain TEXT primary/foreign-key-
// shaped columns with no REFERENCES clause), so purging is responsible for
// walking every table that keys off script_id/project_id itself.
package trash

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/somunaexe/bulwriter/backend/internal/project"
	"github.com/somunaexe/bulwriter/backend/internal/script"
)

// RetentionPeriod is how long a soft-deleted project or script stays
// recoverable in the trash before PurgeExpired removes it for good.
const RetentionPeriod = 30 * 24 * time.Hour

// scriptTables lists every table keyed directly by script_id that holds
// production data and must be cleaned up when a script is permanently
// purged. branches/snapshots aren't listed here — snapshots key off
// branch_id rather than script_id, so purgeScript handles them separately.
// Keep this in sync with new script_id-keyed tables as they're added.
var scriptTables = []string{
	"scene_breakdowns", "schedule_strips", "schedule_days", "scout_candidates",
	"budget_estimates", "budget_line_items", "casting_roles", "script_stories",
	"shots", "scene_notes", "press_kits", "press_kit_stills", "press_kit_bios",
	"milestones", "festival_submissions", "release_links", "credits",
	"rehearsals", "continuity_notes",
}

// projectTables lists every table keyed directly by project_id that holds
// project-scoped (not script-scoped) data.
var projectTables = []string{
	"story_bibles", "story_idea_notes", "crew_members", "project_members", "project_invites",
}

type Store struct {
	db       *sql.DB
	projects *project.Store
	scripts  *script.Store
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db, projects: project.NewStore(db), scripts: script.NewStore(db)}
}

// PurgeExpired permanently deletes every project and script that has sat
// in the trash longer than RetentionPeriod, along with all of their
// dependent production data. Meant to be called periodically — see
// RunPeriodicPurge.
func (s *Store) PurgeExpired() error {
	cutoff := time.Now().Add(-RetentionPeriod)

	scriptIDs, err := s.scripts.ExpiredIDs(cutoff)
	if err != nil {
		return fmt.Errorf("listing expired scripts: %w", err)
	}
	for _, id := range scriptIDs {
		if err := s.purgeScript(id); err != nil {
			return fmt.Errorf("purging script %s: %w", id, err)
		}
	}

	projectIDs, err := s.projects.ExpiredIDs(cutoff)
	if err != nil {
		return fmt.Errorf("listing expired projects: %w", err)
	}
	for _, id := range projectIDs {
		if err := s.purgeProject(id); err != nil {
			return fmt.Errorf("purging project %s: %w", id, err)
		}
	}
	return nil
}

// PurgeProjectNow immediately, permanently deletes a project — used by the
// "Delete forever" trash action to skip the retention window. Refuses to
// touch a project that isn't currently in the trash, so a live project can
// never be purged by mistake.
func (s *Store) PurgeProjectNow(id string) error {
	trashed, err := s.projects.IsTrashed(id)
	if err != nil {
		return err
	}
	if !trashed {
		return errors.New("project is not in the trash")
	}
	return s.purgeProject(id)
}

// PurgeScriptNow is PurgeProjectNow's script-level equivalent.
func (s *Store) PurgeScriptNow(id string) error {
	trashed, err := s.scripts.IsTrashed(id)
	if err != nil {
		return err
	}
	if !trashed {
		return errors.New("script is not in the trash")
	}
	return s.purgeScript(id)
}

// purgeScript permanently deletes a script and every row of production
// data keyed to it, in one transaction.
func (s *Store) purgeScript(scriptID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`DELETE FROM snapshots WHERE branch_id IN (SELECT id FROM branches WHERE script_id = $1)`,
		scriptID,
	); err != nil {
		return fmt.Errorf("deleting snapshots: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM branches WHERE script_id = $1`, scriptID); err != nil {
		return fmt.Errorf("deleting branches: %w", err)
	}
	for _, table := range scriptTables {
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM %s WHERE script_id = $1`, table), scriptID); err != nil {
			return fmt.Errorf("deleting from %s: %w", table, err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM scripts WHERE id = $1`, scriptID); err != nil {
		return fmt.Errorf("deleting script: %w", err)
	}
	return tx.Commit()
}

// purgeProject permanently deletes a project, every script it contains —
// regardless of whether each one was individually trashed, since once the
// project itself is gone so is everything under it — and every row of
// project-scoped data.
func (s *Store) purgeProject(projectID string) error {
	scriptIDs, err := s.scripts.AllIDsForProject(projectID)
	if err != nil {
		return fmt.Errorf("listing project scripts: %w", err)
	}
	for _, id := range scriptIDs {
		if err := s.purgeScript(id); err != nil {
			return err
		}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, table := range projectTables {
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM %s WHERE project_id = $1`, table), projectID); err != nil {
			return fmt.Errorf("deleting from %s: %w", table, err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM projects WHERE id = $1`, projectID); err != nil {
		return fmt.Errorf("deleting project: %w", err)
	}
	return tx.Commit()
}

// RunPeriodicPurge calls PurgeExpired immediately and then every interval,
// forever — meant to be started with `go trash.RunPeriodicPurge(...)` once
// at server startup.
func RunPeriodicPurge(store *Store, interval time.Duration) {
	if err := store.PurgeExpired(); err != nil {
		log.Printf("trash: initial purge failed: %v", err)
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		if err := store.PurgeExpired(); err != nil {
			log.Printf("trash: purge failed: %v", err)
		}
	}
}
