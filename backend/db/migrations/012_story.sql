-- Story bible — Phase 1 (Development) of the production workflow: the
-- idea/story-development stage that happens before a script is written.
-- Genre/tone/theme/core question live once per PROJECT (a series shares
-- these across every episode), while logline/synopsis are per SCRIPT
-- (each episode has its own), mapped against the project's script list.
CREATE TABLE IF NOT EXISTS story_bibles (
    project_id    TEXT PRIMARY KEY,
    core_question TEXT        NOT NULL DEFAULT '',
    genre         TEXT        NOT NULL DEFAULT '',
    tone          TEXT        NOT NULL DEFAULT '',
    theme         TEXT        NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The unfiltered idea dump — "write down every version of the idea
-- without filtering; let it breathe" — a growing list, not a single
-- field, so an earlier version is never lost to a later edit.
CREATE TABLE IF NOT EXISTS story_idea_notes (
    id         TEXT        PRIMARY KEY,
    project_id TEXT        NOT NULL,
    text       TEXT        NOT NULL,
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_idea_notes_project ON story_idea_notes(project_id);

CREATE TABLE IF NOT EXISTS script_stories (
    script_id  TEXT PRIMARY KEY,
    logline    TEXT        NOT NULL DEFAULT '',
    synopsis   TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
