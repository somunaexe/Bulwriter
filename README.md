# Bulwriter

Collaborative screenwriting platform with Git-style version control and real-time co-writing.

## Architecture

```
scriptflow/
├── backend/          Go — REST API + WebSocket sync hub
│   ├── cmd/server/   Entry point
│   └── internal/
│       ├── api/      HTTP router (REST + WebSocket upgrade)
│       ├── hub/      Real-time Yjs relay (WebSocket rooms)
│       └── snapshot/ Version control engine (branches, snapshots, diffs)
└── frontend/         Angular 17 + TypeScript
    └── src/app/
        ├── services/
        │   ├── sync.service.ts             Yjs + ProseMirror session
        │   └── version-control.service.ts  REST client for VC API
        └── components/
            ├── editor/        Main editor shell
            ├── branch-panel/  Sidebar: branches + history
            └── diff-viewer/   Side-by-side draft comparison
```

## How it works

### Real-time sync (Yjs + WebSocket)
- Each script has a **room** on the Go WebSocket hub (keyed by `scriptId`)
- The Angular client creates a `Y.Doc` and connects via `WebsocketProvider`
- Every keystroke produces a small binary **Yjs update** — the CRDT operation
- The hub broadcasts it to all other writers in the room and appends it to an in-memory log
- A writer joining mid-session receives the full log replay and converges to the current state
- **No conflicts possible** — CRDTs merge mathematically, no manual resolution needed

### Version control (snapshots + branches)
- Writers explicitly save named **snapshots** ("Act II rewrite") — these are immutable
- A **branch** is a named pointer to the tip snapshot, just like a Git branch
- Snapshots store the full script text (hashed with SHA-256)
- The **diff** endpoint computes a line-level Myers diff between any two snapshots
- Branching lets a writer explore an alternate ending without touching the main draft

## Quick start

### Backend
```bash
cd backend
go run ./cmd/server
# Listening on :8080
```

### Frontend
```bash
cd frontend
npm install
ng serve
# Dev server on http://localhost:4200
```

Open two browser tabs — both connect to the same script room and sync live.

## Production checklist
- [ ] Replace in-memory snapshot store with **Postgres + S3**
- [ ] Replace in-memory Yjs update log with **Postgres** (persist across restarts)
- [ ] Add **JWT middleware** to the Go router (Clerk or Auth0)
- [ ] Implement **gorilla/mux** properly (the vendor stub is simplified)
- [ ] Add **screenplay schema** to ProseMirror (scene headings, action, dialogue)
- [ ] Wire **Fountain parser** for import/export
- [ ] Add **presence indicators** (cursor colours, writer avatars) via `y-prosemirror` awareness

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | Angular 17, TypeScript |
| Script editor | ProseMirror |
| Real-time sync | Yjs (y-prosemirror, y-websocket) |
| Backend API | Go |
| WebSocket hub | gorilla/websocket |
| Version control | Custom Go package (Myers diff) |
| Auth (production) | Clerk or Auth0 |
| Database (production) | Postgres |
| Object storage (production) | S3 / Cloudflare R2 |
| Automation & Workflows | Github Actions |