-- Soft-delete support for projects and scripts: a NULL deleted_at means
-- "live", a set deleted_at means "in the trash, recoverable for 30 days"
-- (see internal/trash for the periodic purge job that permanently removes
-- rows older than that). Indexed since both the trash listing and the
-- purge job filter on this column.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE scripts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scripts_deleted_at ON scripts(deleted_at) WHERE deleted_at IS NOT NULL;
