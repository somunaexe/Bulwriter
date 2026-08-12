-- Records completed Stripe checkout sessions for donations/sponsorships —
-- written only from the webhook handler (internal/donation) once Stripe
-- confirms the payment actually succeeded, not from the client-side
-- success redirect alone.
CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    interval TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
