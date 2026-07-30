-- The scouting photo is stored as a data URI with no filename metadata
-- of its own — this lets the location scouting UI show the original
-- filename underneath the thumbnail, same as the shot list's storyboard
-- images (see 014_shot_fields.sql).
ALTER TABLE scout_candidates ADD COLUMN IF NOT EXISTS photo_filename TEXT NOT NULL DEFAULT '';
