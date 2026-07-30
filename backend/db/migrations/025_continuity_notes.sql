-- Continuity notes — Phase 3 (Production) script-supervisor gap: a
-- per-scene log of continuity details (props, costume, eyelines)
-- between takes, so an editor can tell which takes cut together
-- cleanly. Keyed by scene_key same as scene_breakdowns/scene_notes;
-- position scoped per scene like scene_notes' music/vfx lists.
CREATE TABLE IF NOT EXISTS continuity_notes (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    scene_key  TEXT        NOT NULL,
    take       TEXT        NOT NULL DEFAULT '',
    note       TEXT        NOT NULL DEFAULT '',
    flagged    BOOLEAN     NOT NULL DEFAULT false,
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_continuity_notes_script ON continuity_notes(script_id);
