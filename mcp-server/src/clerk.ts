// Bulwriter's backend verifies a short-lived Clerk session JWT on every
// request (same as the web app sends) — those expire in roughly a
// minute, so pasting one into an env var once would go stale almost
// immediately. Clerk's own *session* (not the JWT it issues) lives much
// longer (days, sliding), so this mints a fresh JWT from that session on
// demand via Clerk's Backend API, and caches it briefly to avoid minting
// one per tool call in a quick burst.
//
// Needs CLERK_SECRET_KEY (same value already set on the Railway
// backend — Bulwriter's own secret, never commit it) and CLERK_SESSION_ID
// (see mcp-server/README.md for how to grab your own). Both are
// sensitive: this file never logs them.

const CLERK_API = "https://api.clerk.com/v1";

let cachedToken: string | null = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 45_000; // Clerk's default JWT lifetime is ~60s; refresh well before that.

export async function getFreshToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now - cachedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const secretKey = process.env["CLERK_SECRET_KEY"];
  const sessionId = process.env["CLERK_SESSION_ID"];
  if (!secretKey || !sessionId) {
    throw new Error(
      "Missing CLERK_SECRET_KEY or CLERK_SESSION_ID — see mcp-server/README.md for how to set these."
    );
  }

  const res = await fetch(`${CLERK_API}/sessions/${sessionId}/tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Clerk token mint failed (${res.status}): ${body || res.statusText}. ` +
        "Most likely CLERK_SESSION_ID has expired (sign in again at Bulwriter and grab a fresh one) " +
        "or CLERK_SECRET_KEY doesn't match the session's instance."
    );
  }

  const data = (await res.json()) as { jwt?: string };
  if (!data.jwt) {
    throw new Error("Clerk token mint succeeded but the response had no jwt field — Clerk's API shape may have changed.");
  }

  cachedToken = data.jwt;
  cachedAt = now;
  return cachedToken;
}
