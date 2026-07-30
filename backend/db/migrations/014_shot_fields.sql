-- Splits shot_type into three explicit fields — shot size, camera
-- angle, camera movement — instead of one delimited string. The
-- frontend was always treating them as three separate inputs anyway;
-- storing them as three real columns makes each one independently
-- queryable later instead of requiring the frontend's parsing
-- convention to make sense of a single opaque string.
-- Also adds image_filename, shown under the storyboard thumbnail — a
-- data URI carries no filename of its own.
ALTER TABLE shots ADD COLUMN IF NOT EXISTS shot_size TEXT NOT NULL DEFAULT '';
ALTER TABLE shots ADD COLUMN IF NOT EXISTS camera_angle TEXT NOT NULL DEFAULT '';
ALTER TABLE shots ADD COLUMN IF NOT EXISTS camera_movement TEXT NOT NULL DEFAULT '';
ALTER TABLE shots ADD COLUMN IF NOT EXISTS image_filename TEXT NOT NULL DEFAULT '';

-- Migrate.go re-runs every migration file on every startup (no
-- migrations-applied tracking table — see db/migrate.go), so the
-- backfill+drop below has to be a no-op once shot_type is already
-- gone, not just once per fresh database. A bare UPDATE referencing
-- shot_type would fail on the second run, once it no longer exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shots' AND column_name = 'shot_type'
    ) THEN
        UPDATE shots SET
            shot_size       = split_part(shot_type, '|', 1),
            camera_angle    = split_part(shot_type, '|', 2),
            camera_movement = split_part(shot_type, '|', 3)
        WHERE shot_type IS NOT NULL AND shot_type != '';

        ALTER TABLE shots DROP COLUMN shot_type;
    END IF;
END $$;
