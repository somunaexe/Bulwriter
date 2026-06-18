-- branches: named pointers to the tip of a line of work
CREATE TABLE IF NOT EXISTS branches (
    id         TEXT PRIMARY KEY,
    script_id  TEXT        NOT NULL,
    name       TEXT        NOT NULL,
    tip_id     TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- snapshots: immutable point-in-time captures of a script
CREATE TABLE IF NOT EXISTS snapshots (
    id         TEXT PRIMARY KEY,
    branch_id  TEXT        NOT NULL,
    hash       TEXT        NOT NULL,
    content    TEXT        NOT NULL,
    message    TEXT        NOT NULL DEFAULT '',
    author_id  TEXT        NOT NULL DEFAULT '',
    parent_id  TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- index so listing branches by project is fast
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(script_id);

-- index so fetching history by branch is fast  
CREATE INDEX IF NOT EXISTS idx_snapshots_branch ON snapshots(branch_id);