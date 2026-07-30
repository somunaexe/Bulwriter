-- Rehearsals — Phase 2 (Pre-Production) "Design & Prep" gap: a
-- lightweight, position-ordered log of rehearsal sessions per script
-- (date, time, what's being rehearsed, notes). Same shape as
-- milestones/budget_line_items — a simple ordered list, not a full
-- calendar/booking system.
CREATE TABLE IF NOT EXISTS rehearsals (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    date       TEXT        NOT NULL DEFAULT '',
    time       TEXT        NOT NULL DEFAULT '',
    focus      TEXT        NOT NULL DEFAULT '', -- scenes/characters being rehearsed
    notes      TEXT        NOT NULL DEFAULT '',
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rehearsals_script ON rehearsals(script_id);
