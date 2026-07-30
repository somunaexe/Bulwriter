-- Phase 4 (Post-Production) milestone tracker: a lightweight,
-- position-ordered list of post-production stages (rough cut, picture
-- lock, sound mix, color grade, final export, etc.) per script, each
-- with a status and freeform notes. Same list-per-script + position
-- convention as budget_line_items/press_kit_stills — a simple ordered
-- checklist, not a full task system.
CREATE TABLE IF NOT EXISTS milestones (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    label      TEXT        NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'not_started', -- 'not_started' | 'in_progress' | 'done'
    notes      TEXT        NOT NULL DEFAULT '',
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_script ON milestones(script_id);
