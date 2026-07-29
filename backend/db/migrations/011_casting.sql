-- Casting — actor/contact/status per character. Keyed by character name
-- (character_name), same convention as scene_breakdowns/schedule_strips'
-- scene_key, since the schema has no durable character ID; two
-- characters sharing an identical cue name share the same casting row.
CREATE TABLE IF NOT EXISTS casting_roles (
    id             TEXT        PRIMARY KEY,
    script_id      TEXT        NOT NULL,
    character_name TEXT        NOT NULL,
    actor_name     TEXT        NOT NULL DEFAULT '',
    contact        TEXT        NOT NULL DEFAULT '',
    status         TEXT        NOT NULL DEFAULT 'open',
    notes          TEXT        NOT NULL DEFAULT '',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (script_id, character_name)
);

CREATE INDEX IF NOT EXISTS idx_casting_roles_script ON casting_roles(script_id);
