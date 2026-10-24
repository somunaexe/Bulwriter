# bulwriter-mcp

An MCP server that exposes your own Bulwriter account to Claude: list your
projects, read and add to a project's story bible, and read/add budget line
items — the same REST API the Bulwriter web app itself calls.

It runs in two different modes, for two different ways of using it:

- **Local (stdio)** — `index.ts`, run as a subprocess on your own machine,
  registered with `claude mcp add`. Simplest option; see "Setup" below.
- **Remote (HTTP + OAuth)** — `server-http.ts`, an always-on server with its
  own login screen, deployed somewhere public so it can be added to claude.ai
  as a **custom connector**. See "Remote connector (claude.ai)" below.

## Tools

- `list_projects` — list all projects you belong to.
- `get_project` — get one project's details.
- `list_scripts` — list the scripts inside a project.
- `get_story_bible` — read a project's story bible (core question, genre/tone/theme, idea notes, loglines/synopses).
- `add_idea_note` — append a new idea note to a project's story bible.
- `get_budget` — read a script's budget (rate estimate + freeform line items).
- `add_budget_line_item` — add a freeform line item (label + amount) to a script's budget.

## Why it needs two Clerk values, not one

Bulwriter's backend verifies a short-lived Clerk session JWT on every
request — the same kind the web app sends, good for roughly a minute. A
JWT pasted into an env var once would go stale almost immediately. Clerk's
underlying *session* lives much longer (days, sliding), so this server
mints a fresh JWT from that session on every tool call (cached 45s to
avoid minting one per call in a quick burst) via Clerk's Backend API.

That means you need:

1. **`CLERK_SECRET_KEY`** — Bulwriter's own Clerk secret key. Already set
   as an env var on the Railway backend (Railway dashboard →
   `bulwriter-backend` service → Variables → `CLERK_SECRET_KEY`).
2. **`CLERK_SESSION_ID`** — *your* personal, currently-active session id.
   To get it:
   1. Sign in to Bulwriter in your browser as normal.
   2. Open devtools → Console.
   3. Run `window.Clerk.session.id` and copy the `sess_...` value.

   This expires when you sign out or the session otherwise ends — if the
   server starts failing with a 401/"token mint failed", just repeat these
   steps and update `.env`.

Both values are sensitive. `.env` is already git-ignored; never commit it
or paste these values anywhere public.

## Setup

```bash
cd mcp-server
npm install
npm run build
cp .env.example .env   # then fill in CLERK_SECRET_KEY and CLERK_SESSION_ID
```

## Registering with Claude Code

```bash
claude mcp add bulwriter -- node /absolute/path/to/Bulwriter/mcp-server/dist/index.js \
  --env CLERK_SECRET_KEY=sk_live_... \
  --env CLERK_SESSION_ID=sess_...
```

Or, if you'd rather keep the secrets in `.env` and not on the command
line, point `claude mcp add` at a small wrapper script that `source`s
`.env` before exec'ing `node dist/index.js`.

Once registered, ask Claude things like "list my Bulwriter projects" or
"add a $500 'Insurance' line item to [script]'s budget" and it will call
these tools directly.

## Remote connector (claude.ai)

claude.ai's custom connectors call a server over the public internet, not a
local process — so this mode needs a second, always-on deployment. It's a
separate concern from the local stdio server above: same tools, same
Bulwriter credentials, but reachable from anywhere, which is why it sits
behind its own login screen (`MCP_OAUTH_PASSWORD`) rather than trusting
whoever can reach the URL.

### How the auth works

claude.ai registers itself as an OAuth client (dynamic client registration),
then sends you through a real OAuth 2.1 + PKCE authorization-code flow:
you land on a password prompt this server renders itself, and only after
that succeeds does claude.ai get an access token for `/mcp`. Everything
(registered clients, issued codes/tokens) lives in memory — if the server
restarts, previously-connected clients lose their tokens and you'll need to
remove and re-add the connector in claude.ai. That's a deliberate simplicity
tradeoff for a single-user tool, not a general multi-tenant OAuth setup.

### Deploy it (Railway)

This repo's Railway project already runs the Go backend as one service.
Add this as a **second service in the same project**, not merged into the
backend — different runtime (Node vs Go), and you don't want a crash or
redeploy of one to take down the other (they're not fully independent
either way, since this server calls the backend's API).

1. Railway dashboard → your Bulwriter project → **New Service** → **Deploy
   from GitHub repo** → pick this repo.
2. In that new service's **Settings**, set **Root Directory** to
   `mcp-server`. Railway will then use `mcp-server/railway.json` and
   `mcp-server/Dockerfile` automatically.
3. **Settings → Networking → Generate Domain** to get a public HTTPS URL
   (something like `bulwriter-mcp-production.up.railway.app`).
4. **Variables**, set:
   - `CLERK_SECRET_KEY` — same value as the backend service.
   - `CLERK_SESSION_ID` — your own, per the steps above.
   - `PUBLIC_URL` — the domain from step 3, with `https://`, no trailing
     slash (e.g. `https://bulwriter-mcp-production.up.railway.app`).
   - `MCP_OAUTH_PASSWORD` — a long random value, e.g. output of
     `openssl rand -hex 24`. This is what you'll type into the login screen
     when connecting claude.ai.
5. Redeploy after setting `PUBLIC_URL` (it can't be known before step 3
   assigns the domain).
6. Check `https://<your-domain>/health` returns `ok`.

### Add it in claude.ai

1. claude.ai → **Settings → Connectors → Add custom connector**.
2. URL: `https://<your-domain>/mcp`.
3. Leave the OAuth Client ID/Secret fields blank — claude.ai will register
   itself automatically against this server's `/register` endpoint.
4. Connect. You'll be sent to this server's own login page — enter
   `MCP_OAUTH_PASSWORD`. On success you're redirected back and the
   connector shows connected.
5. Ask Claude something like "list my Bulwriter projects" in a chat where
   the connector is enabled.

If it stops working after a redeploy, remove and re-add the connector (see
"How the auth works" above for why).
