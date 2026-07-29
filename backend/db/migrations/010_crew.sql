-- Crew — the below-the-line production team (DP, 1st AD, sound, etc.),
-- distinct from project_members: crew members aren't Bulwriter accounts
-- and never touch the script itself, just names/roles/contact info for
-- the production. Project-scoped (one crew per production), not
-- script-scoped, since a project's crew works across whichever scripts
-- it has.
CREATE TABLE IF NOT EXISTS crew_members (
    id         TEXT        PRIMARY KEY,
    project_id TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT '',
    name       TEXT        NOT NULL DEFAULT '',
    contact    TEXT        NOT NULL DEFAULT '',
    notes      TEXT        NOT NULL DEFAULT '',
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_project ON crew_members(project_id);
