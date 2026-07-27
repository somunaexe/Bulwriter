-- Per-project background image (a data URI, resized/compressed client-side
-- before upload) — faintly personalizes the editor's chrome around the
-- manuscript page. Nullable: most projects never set one.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS background_image TEXT;
