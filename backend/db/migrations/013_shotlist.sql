-- Shot list & storyboards — Phase 2 "Design & Prep": the director's shot
-- list for every scene, with an optional storyboard frame image per
-- shot. Keyed by scene_key like breakdown/casting; position IS the shot
-- number (shot 1, 2, 3...) within the scene, since a shot list is
-- fundamentally a sequence, not just a set.
CREATE TABLE IF NOT EXISTS shots (
    id          TEXT        PRIMARY KEY,
    script_id   TEXT        NOT NULL,
    scene_key   TEXT        NOT NULL,
    shot_type   TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    image       TEXT        NOT NULL DEFAULT '',
    position    INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shots_script ON shots(script_id);
