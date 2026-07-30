-- Festival & release tracker — Phase 5 (Distribution & Release), the
-- rest of it beyond the press kit: festival submissions (#18-19 —
-- name, deadline, fee, status, premiere-rule flag, and freeform
-- notes for results/awards) and online release links (#20 — platform,
-- URL, release date). Two independent lightweight lists per script,
-- same position-per-script convention as press_kit_stills/shots —
-- shown together in one combined drawer on the frontend, same
-- reasoning as scene_notes' music/vfx split.
CREATE TABLE IF NOT EXISTS festival_submissions (
    id                TEXT        PRIMARY KEY,
    script_id         TEXT        NOT NULL,
    festival_name     TEXT        NOT NULL,
    deadline          TEXT        NOT NULL DEFAULT '',
    fee               NUMERIC     NOT NULL DEFAULT 0,
    status            TEXT        NOT NULL DEFAULT 'planned', -- 'planned' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn'
    premiere_required BOOLEAN     NOT NULL DEFAULT false,
    notes             TEXT        NOT NULL DEFAULT '',
    position          INTEGER     NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_submissions_script ON festival_submissions(script_id);

CREATE TABLE IF NOT EXISTS release_links (
    id           TEXT        PRIMARY KEY,
    script_id    TEXT        NOT NULL,
    platform     TEXT        NOT NULL,
    url          TEXT        NOT NULL DEFAULT '',
    release_date TEXT        NOT NULL DEFAULT '',
    notes        TEXT        NOT NULL DEFAULT '',
    position     INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_links_script ON release_links(script_id);
