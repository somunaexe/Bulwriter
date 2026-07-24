-- Auto-save writes here instead of creating a new snapshot every time it
-- fires — snapshots stay reserved for drafts a writer explicitly chooses
-- to name and keep. Cleared back to empty whenever a real snapshot is
-- committed, since the new snapshot is then the freshest known state.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS draft_content TEXT NOT NULL DEFAULT '';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;
