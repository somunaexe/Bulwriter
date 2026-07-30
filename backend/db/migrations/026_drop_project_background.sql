-- Removes the per-project background image feature (007) — it's gone
-- from the application entirely, so the column goes with it. Plain
-- DROP COLUMN IF EXISTS is safe to rerun on every startup on its own,
-- no guard needed (unlike migrations that UPDATE a column before
-- dropping it).
ALTER TABLE projects DROP COLUMN IF EXISTS background_image;
