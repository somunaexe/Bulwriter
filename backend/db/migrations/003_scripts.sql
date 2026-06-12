CREATE TABLE IF NOT EXISTS scripts (
    id          TEXT        PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);