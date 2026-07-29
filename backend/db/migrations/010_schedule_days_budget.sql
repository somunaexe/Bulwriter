-- Day-level metadata for the stripboard's shoot days (date, general call
-- time, location, notes) — feeds the call sheet. Kept in its own table,
-- keyed by (script_id, day_number) same as schedule_strips, and always
-- rewritten together with strips in the same transaction (see
-- schedule.Store.Replace) so day_number stays aligned across both when
-- days are added/removed/renumbered.
CREATE TABLE IF NOT EXISTS schedule_days (
    script_id  TEXT        NOT NULL,
    day_number INTEGER     NOT NULL,
    shoot_date TEXT        NOT NULL DEFAULT '',
    call_time  TEXT        NOT NULL DEFAULT '',
    location   TEXT        NOT NULL DEFAULT '',
    notes      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (script_id, day_number)
);

-- Budget estimator — a handful of per-unit rates (crew day, location,
-- cast, prop) multiplied against counts already derivable from the scene
-- breakdown/schedule, plus freeform line items for anything that doesn't
-- map to a derived count (insurance, post-production, etc.). One row of
-- rates per script; line items are a separate list.
CREATE TABLE IF NOT EXISTS budget_estimates (
    script_id     TEXT PRIMARY KEY,
    day_rate      NUMERIC NOT NULL DEFAULT 0,
    location_rate NUMERIC NOT NULL DEFAULT 0,
    cast_rate     NUMERIC NOT NULL DEFAULT 0,
    prop_rate     NUMERIC NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_line_items (
    id         TEXT        PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    label      TEXT        NOT NULL,
    amount     NUMERIC     NOT NULL DEFAULT 0,
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_line_items_script ON budget_line_items(script_id);
