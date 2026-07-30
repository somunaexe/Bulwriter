-- Credits — Phase 4 (Post-Production), "Titles & Credits": cast and
-- crew are pulled live from casting/crew (same reasoning as the press
-- kit — no duplication), so all that needs storing here is the
-- freeform "additional credits" block for anything that isn't a cast
-- or crew name: music licences, location acknowledgements, funding/
-- sponsor logos. One row per script, same shape as press_kits'
-- director_statement.
CREATE TABLE IF NOT EXISTS credits (
    script_id           TEXT        PRIMARY KEY,
    additional_credits  TEXT        NOT NULL DEFAULT '',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
