-- Phase 3 (Production) daily disciplines: a shoot day's end-of-day
-- wrap checklist — footage backed up, dailies reviewed, plus the
-- camera and sound reports and general wrap notes. Lives on
-- schedule_days alongside the existing call-sheet fields (same
-- (script_id, day_number) row, always rewritten together with strips
-- in schedule.Store.Replace) rather than a new table, since it's more
-- fields on the same "one shoot day" record, not a new list.
ALTER TABLE schedule_days
    ADD COLUMN IF NOT EXISTS data_backed_up   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS dailies_reviewed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS camera_report     TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sound_report      TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS wrap_notes        TEXT    NOT NULL DEFAULT '';
