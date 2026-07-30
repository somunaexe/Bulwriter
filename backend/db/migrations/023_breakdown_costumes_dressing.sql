-- Phase 2 "Design & Prep" gap: production design needs to tag costumes
-- and set dressing per scene, same as props already does. Same
-- JSON-array-in-a-TEXT-column shape as the existing props column, kept
-- alongside it on scene_breakdowns rather than a new table since it's
-- more tag lists on the same "one tag set per scene" record.
ALTER TABLE scene_breakdowns
    ADD COLUMN IF NOT EXISTS costumes     TEXT NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS set_dressing TEXT NOT NULL DEFAULT '[]';
