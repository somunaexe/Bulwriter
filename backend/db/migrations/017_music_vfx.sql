-- Music & VFX suggestions per scene — one drawer, two lightweight lists
-- (kind = 'music' | 'vfx') sharing the same shape: a freeform
-- description of the cue/effect, a simple progress status, and notes.
-- Position is scoped per (script_id, scene_key, kind), so music and
-- VFX entries for the same scene are numbered independently of each
-- other — same reasoning as shots' per-scene position.
CREATE TABLE IF NOT EXISTS scene_notes (
    id          TEXT        PRIMARY KEY,
    script_id   TEXT        NOT NULL,
    scene_key   TEXT        NOT NULL,
    kind        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'suggested',
    notes       TEXT        NOT NULL DEFAULT '',
    position    INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scene_notes_script ON scene_notes(script_id);
