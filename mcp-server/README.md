# bulwriter-mcp

An MCP server that exposes your own Bulwriter account to Claude: list your
projects, read and add to a project's story bible, and read/add budget line
items — the same REST API the Bulwriter web app itself calls.

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
