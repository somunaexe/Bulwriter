-- project_members: many-to-many between projects and users
CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT        NOT NULL,
    user_id    TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'viewer', -- 'owner' | 'editor' | 'viewer'
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id);

-- project_invites: pending invitations by email
CREATE TABLE IF NOT EXISTS project_invites (
    id         TEXT PRIMARY KEY,
    project_id TEXT        NOT NULL,
    email      TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'viewer',
    status     TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_email ON project_invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_project ON project_invites(project_id);