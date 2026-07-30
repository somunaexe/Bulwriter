-- Press kit — Phase 5 (Distribution & Release): "stills, synopsis,
-- director's statement, cast/crew bios, poster." Synopsis/logline are
-- already covered by script_stories (Phase 1's Story Bible) and read
-- from there rather than duplicated; everything else lives here.
CREATE TABLE IF NOT EXISTS press_kits (
    script_id          TEXT PRIMARY KEY,
    director_statement TEXT        NOT NULL DEFAULT '',
    poster             TEXT        NOT NULL DEFAULT '',
    poster_filename    TEXT        NOT NULL DEFAULT '',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stills are a repeatable list, same position-per-script convention as
-- shots/budget line items.
CREATE TABLE IF NOT EXISTS press_kit_stills (
    id             TEXT        PRIMARY KEY,
    script_id      TEXT        NOT NULL,
    image          TEXT        NOT NULL DEFAULT '',
    image_filename TEXT        NOT NULL DEFAULT '',
    caption        TEXT        NOT NULL DEFAULT '',
    position       INTEGER     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_kit_stills_script ON press_kit_stills(script_id);

-- A bio blurb for one cast candidate or crew member, scoped to this
-- script's press kit rather than stored on casting_roles/crew directly
-- — those tables are for production contact info, not press copy, and
-- a person could reasonably want different press wording per project.
CREATE TABLE IF NOT EXISTS press_kit_bios (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    kind       TEXT        NOT NULL, -- 'cast' | 'crew'
    person_id  TEXT        NOT NULL, -- casting_roles.id or crew.id
    bio        TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (script_id, kind, person_id)
);

CREATE INDEX IF NOT EXISTS idx_press_kit_bios_script ON press_kit_bios(script_id);
