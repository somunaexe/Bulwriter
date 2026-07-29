-- Shooting schedule (stripboard) — one row per scene assigned to a shoot
-- day, with its order within that day. Keyed by scene heading text, same
-- convention as scene_breakdowns, since the schema has no durable scene
-- ID. The whole schedule is replaced as one unit on every reorder (see
-- schedule.Store.Replace) rather than patched strip-by-strip.
CREATE TABLE IF NOT EXISTS schedule_strips (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    scene_key  TEXT        NOT NULL,
    day_number INTEGER     NOT NULL,
    position   INTEGER     NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (script_id, scene_key)
);

CREATE INDEX IF NOT EXISTS idx_schedule_strips_script ON schedule_strips(script_id);
