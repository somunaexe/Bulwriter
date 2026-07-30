-- Casting moves from one row per character to many — several actors can
-- audition for the same character (character_name), same "candidates,
-- pick one" shape location scouting already uses for scout_candidates
-- (is_cast here plays the same role scout_candidates.is_selected does).
--
-- Guarded the same way as 014_shot_fields.sql: Migrate() re-runs every
-- .sql file on every startup (no migrations-applied tracking table), so
-- this whole block only does anything on the first run, when the old
-- one-row-per-character UNIQUE constraint is still present. On every
-- run after that it's a no-op.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'casting_roles'
          AND constraint_name = 'casting_roles_script_id_character_name_key'
    ) THEN
        ALTER TABLE casting_roles DROP CONSTRAINT casting_roles_script_id_character_name_key;
        ALTER TABLE casting_roles ADD COLUMN is_cast BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE casting_roles ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE casting_roles ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

        -- Each existing row was the one actor on file for its character —
        -- carry that forward as the cast candidate, and use its old
        -- updated_at as a best-guess created_at rather than "now."
        UPDATE casting_roles SET created_at = updated_at, is_cast = (status = 'cast');
    END IF;
END $$;
