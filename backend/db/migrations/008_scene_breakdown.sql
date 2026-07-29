-- Per-scene production tags (props, notes) — locations and cast are
-- derived live from the script text itself (see frontend
-- scene-breakdown.ts), so only what can't be derived is stored here.
-- Keyed by scene heading text rather than a durable scene ID, since the
-- screenplay schema has no such ID; two scenes sharing an identical
-- heading share the same tags.
CREATE TABLE IF NOT EXISTS scene_breakdowns (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    scene_key  TEXT        NOT NULL,
    props      TEXT        NOT NULL DEFAULT '[]',
    notes      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (script_id, scene_key)
);

CREATE INDEX IF NOT EXISTS idx_scene_breakdowns_script ON scene_breakdowns(script_id);
