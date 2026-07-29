-- Location scouting — candidate real-world locations for each unique
-- location the script needs. Keyed by location_key, the same normalized
-- form the stripboard groups shoot days by (INT/EXT prefix and
-- DAY/NIGHT suffix stripped, since what matters for scouting is *where*,
-- not the scene's time of day) — several candidates can share a
-- location_key, with at most one marked as_selected per key (see
-- scouting.Store.Select).
CREATE TABLE IF NOT EXISTS scout_candidates (
    id           TEXT        PRIMARY KEY,
    script_id    TEXT        NOT NULL,
    location_key TEXT        NOT NULL,
    name         TEXT        NOT NULL DEFAULT '',
    address      TEXT        NOT NULL DEFAULT '',
    notes        TEXT        NOT NULL DEFAULT '',
    photo        TEXT        NOT NULL DEFAULT '',
    is_selected  BOOLEAN     NOT NULL DEFAULT false,
    position     INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_candidates_script ON scout_candidates(script_id);
