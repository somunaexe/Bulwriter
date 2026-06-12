CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    title     TEXT        NOT NULL,
    owner_id   TEXT        NOT NULL DEFAULT 'anonymous',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);