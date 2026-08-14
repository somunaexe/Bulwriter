// api.go — HTTP router
// Wires REST endpoints for version control and the WebSocket upgrade
// for real-time Yjs sync. In production add JWT middleware here.
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"database/sql"
	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"github.com/somunaexe/bulwriter/backend/internal/anthropic"
	"github.com/somunaexe/bulwriter/backend/internal/breakdown"
	"github.com/somunaexe/bulwriter/backend/internal/budget"
	"github.com/somunaexe/bulwriter/backend/internal/casting"
	"github.com/somunaexe/bulwriter/backend/internal/clerkapi"
	"github.com/somunaexe/bulwriter/backend/internal/continuity"
	"github.com/somunaexe/bulwriter/backend/internal/credits"
	"github.com/somunaexe/bulwriter/backend/internal/crew"
	"github.com/somunaexe/bulwriter/backend/internal/distribution"
	"github.com/somunaexe/bulwriter/backend/internal/donation"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
	"github.com/somunaexe/bulwriter/backend/internal/membership"
	"github.com/somunaexe/bulwriter/backend/internal/middleware"
	"github.com/somunaexe/bulwriter/backend/internal/milestone"
	"github.com/somunaexe/bulwriter/backend/internal/musicvfx"
	"github.com/somunaexe/bulwriter/backend/internal/presskit"
	"github.com/somunaexe/bulwriter/backend/internal/project"
	"github.com/somunaexe/bulwriter/backend/internal/rehearsal"
	"github.com/somunaexe/bulwriter/backend/internal/schedule"
	"github.com/somunaexe/bulwriter/backend/internal/scouting"
	"github.com/somunaexe/bulwriter/backend/internal/script"
	"github.com/somunaexe/bulwriter/backend/internal/shotlist"
	"github.com/somunaexe/bulwriter/backend/internal/snapshot"
	"github.com/somunaexe/bulwriter/backend/internal/story"
	"github.com/somunaexe/bulwriter/backend/internal/trash"
)

type router struct {
	hub             *hub.Hub
	store           *snapshot.Store
	projects        *project.Store
	scripts         *script.Store
	trash           *trash.Store
	members         *membership.Store // ← add this
	breakdown       *breakdown.Store
	schedule        *schedule.Store
	scouting        *scouting.Store
	crew            *crew.Store
	casting         *casting.Store
	budget          *budget.Store
	story           *story.Store
	shots           *shotlist.Store
	musicvfx        *musicvfx.Store
	presskit        *presskit.Store
	milestones      *milestone.Store
	distribution    *distribution.Store
	credits         *credits.Store
	rehearsals      *rehearsal.Store
	continuity      *continuity.Store
	clerk           *clerkapi.Client
	anthropic       *anthropic.Client
	donations       *donation.Client
	donationsStore  *donation.Store
	storyGenLimiter *middleware.RateLimiter
}

func NewRouter(h *hub.Hub, db *sql.DB) http.Handler {
	r := &router{
		hub:            h,
		store:          snapshot.NewStore(db),
		projects:       project.NewStore(db),
		scripts:        script.NewStore((db)),
		trash:          trash.NewStore(db),
		members:        membership.NewStore(db),
		breakdown:      breakdown.NewStore(db),
		schedule:       schedule.NewStore(db),
		scouting:       scouting.NewStore(db),
		crew:           crew.NewStore(db),
		casting:        casting.NewStore(db),
		budget:         budget.NewStore(db),
		story:          story.NewStore(db),
		shots:          shotlist.NewStore(db),
		musicvfx:       musicvfx.NewStore(db),
		presskit:       presskit.NewStore(db),
		milestones:     milestone.NewStore(db),
		distribution:   distribution.NewStore(db),
		credits:        credits.NewStore(db),
		rehearsals:     rehearsal.NewStore(db),
		continuity:     continuity.NewStore(db),
		clerk:          clerkapi.NewClient(),
		anthropic:      anthropic.NewClient(),
		donations:      donation.NewClient(),
		donationsStore: donation.NewStore(db),
		// Each call costs real money (Anthropic API) — kept much tighter
		// than the general API limiter below.
		storyGenLimiter: middleware.NewRateLimiter(5, time.Hour),
	}
	go r.storyGenLimiter.StartCleanup(30 * time.Minute)

	// General per-user request limiter, applied to the whole /api
	// subrouter below — generous enough for normal editing/autosave
	// traffic, tight enough to blunt scripted abuse. In-memory, so it
	// only limits per backend instance (see RateLimiter's own doc
	// comment) — fine for a single Railway service today.
	apiLimiter := middleware.NewRateLimiter(120, time.Minute)
	go apiLimiter.StartCleanup(10 * time.Minute)

	// Keyed by IP rather than user ID — donating doesn't require signing
	// in, so there's no authenticated user to key on here.
	donateLimiter := middleware.NewRateLimiter(10, time.Hour)
	go donateLimiter.StartCleanup(30 * time.Minute)

	mx := mux.NewRouter()

	// Public routes — no auth needed

	// Public health check
	mx.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}).Methods("GET")

	// Donations/sponsorships — deliberately outside the /api subrouter's
	// RequireAuth below, so anyone can support the project without a
	// Bulwriter account.
	mx.Handle(
		"/api/donate/checkout",
		donateLimiter.Middleware(middleware.ClientIP)(http.HandlerFunc(r.createDonationCheckout)),
	).Methods("POST")

	// Stripe's server-to-server confirmation that a checkout session
	// actually completed — the only source of truth for "a donation
	// succeeded" the backend has. Deliberately not rate-limited: the
	// signature check is the real gate (see stripeWebhook), and limiting
	// by IP risks silently dropping legitimate retries during a Stripe
	// delivery storm.
	mx.HandleFunc("/api/donate/webhook", r.stripeWebhook).Methods("POST")

	// CORS — allow Angular dev server
	c := cors.New(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:4200",
			"https://*.app.github.dev",
			"https://d1hspb5r4tyd4l.cloudfront.net",
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	// ── Real-time sync ───────────────────────────────────────────────
	// Clients connect here: ws://host/ws/{scriptId}
	mx.HandleFunc("/ws/{scriptId}", r.wsUpgrade)

	// Protected routes — wrap with RequireAuth
	api := mx.PathPrefix("/api").Subrouter()
	// api.Methods("OPTIONS").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	// 	w.WriteHeader(http.StatusOK)
	// })

	api.Use(middleware.RequireAuth)
	// Runs after RequireAuth, so UserIDFromContext is already populated —
	// the rate-limit key is per-user, not per-IP (IPs behind a shared
	// NAT/proxy would otherwise share a budget).
	api.Use(apiLimiter.Middleware(middleware.UserIDFromContext))
	// ── Version control ─────────────────────────────────────────────
	// Projects
	api.HandleFunc("/projects", r.listProjects).Methods("GET")
	api.HandleFunc("/projects", r.createProject).Methods("POST")
	api.HandleFunc("/projects/{projectId}", r.getProject).Methods("GET")
	api.HandleFunc("/projects/{projectId}", r.renameProject).Methods("PUT")
	api.HandleFunc("/projects/{projectId}", r.deleteProject).Methods("DELETE")

	// Scripts
	api.HandleFunc("/projects/{projectId}/scripts", r.listScripts).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts", r.createScript).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}", r.getScript).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}", r.renameScript).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}", r.deleteScript).Methods("DELETE")

	// Trash — deleting a project or script moves it here instead of
	// removing it outright. Recoverable via restore for 30 days, after
	// which the periodic purge job (see internal/trash) discards it for
	// good — or a DELETE here skips the wait and purges it immediately.
	api.HandleFunc("/trash/projects", r.listTrashedProjects).Methods("GET")
	api.HandleFunc("/trash/projects/{projectId}/restore", r.restoreProject).Methods("POST")
	api.HandleFunc("/trash/projects/{projectId}", r.purgeProjectNow).Methods("DELETE")
	api.HandleFunc("/projects/{projectId}/trash/scripts", r.listTrashedScripts).Methods("GET")
	api.HandleFunc("/projects/{projectId}/trash/scripts/{scriptId}/restore", r.restoreScript).Methods("POST")
	api.HandleFunc("/projects/{projectId}/trash/scripts/{scriptId}", r.purgeScriptNow).Methods("DELETE")

	// Branches
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches", r.listBranches).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches", r.createBranch).Methods("POST")

	// Snapshots
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches/{branchId}/commit", r.commit).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches/{branchId}/draft", r.saveDraft).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches/{branchId}/history", r.history).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/branches/{branchId}/snapshots/{snapshotId}", r.getSnapshot).Methods("GET")

	// Diff between two snapshots
	api.HandleFunc("/diff", r.diff).Methods("GET") // ?from=<id>&to=<id>

	// Scene breakdown — production tags (props, notes) per scene.
	// Locations/cast are derived live from the script text on the
	// frontend, not stored here.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/breakdown", r.listBreakdown).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/breakdown", r.upsertBreakdown).Methods("PUT")

	// Shooting schedule (stripboard) — the whole thing (strips + each
	// day's call-sheet metadata) is replaced as one unit on every
	// reorder rather than patched strip-by-strip.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/schedule", r.getSchedule).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/schedule", r.replaceSchedule).Methods("PUT")

	// Casting — multiple actor candidates can audition for the same
	// character (character_name), same "candidates, pick one" shape as
	// location scouting. Characters themselves are derived live from the
	// script text on the frontend, same as breakdown's cast, not stored
	// here.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting", r.listCasting).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting", r.addCastingCandidate).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting/{candidateId}", r.updateCastingCandidate).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting/{candidateId}/cast", r.castCastingCandidate).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting/{candidateId}", r.removeCastingCandidate).Methods("DELETE")
	// Budget estimator — per-unit rates (day/location/cast/prop, matched
	// against counts the frontend derives from the breakdown/schedule)
	// plus freeform line items for anything else.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget", r.getBudget).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget", r.setBudgetEstimate).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget/line-items", r.addBudgetLineItem).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget/line-items/{itemId}", r.removeBudgetLineItem).Methods("DELETE")

	// Story bible — Phase 1 (Development): the idea/logline/synopsis
	// stage that happens before a script is written. Genre/tone/theme/
	// core question are shared project-wide (a series keeps these
	// consistent across episodes); logline/synopsis are per script.
	api.HandleFunc("/projects/{projectId}/story", r.getStory).Methods("GET")
	api.HandleFunc("/projects/{projectId}/story", r.setStoryBible).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/story/notes", r.addStoryIdeaNote).Methods("POST")
	api.HandleFunc("/projects/{projectId}/story/notes/{noteId}", r.updateStoryIdeaNote).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/story/notes/{noteId}", r.removeStoryIdeaNote).Methods("DELETE")
	// Extra-tight limiter on top of the general one above — each call
	// costs real money (the Anthropic API), unlike everything else here.
	api.Handle(
		"/projects/{projectId}/story/generate",
		r.storyGenLimiter.Middleware(middleware.UserIDFromContext)(http.HandlerFunc(r.generateStoryBible)),
	).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/story", r.setScriptStory).Methods("PUT")

	// Members & Invites
	api.HandleFunc("/projects/{projectId}/members", r.listMembers).Methods("GET")
	api.HandleFunc("/projects/{projectId}/invites", r.listInvites).Methods("GET")
	api.HandleFunc("/projects/{projectId}/invites", r.createInvite).Methods("POST")

	// Invites addressed to the signed-in user, across all projects — they
	// decide whether to accept or decline, rather than invites being
	// silently auto-accepted on next login.
	api.HandleFunc("/invites/mine", r.listMyInvites).Methods("GET")
	api.HandleFunc("/invites/{inviteId}/accept", r.acceptInvite).Methods("POST")
	api.HandleFunc("/invites/{inviteId}/decline", r.declineInvite).Methods("POST")

	// Roles
	api.HandleFunc("/projects/{projectId}/my-role", r.getMyRole).Methods("GET")

	// Location scouting — candidate real-world locations per unique
	// location the script needs (locations themselves are derived live
	// from the script text on the frontend, same as breakdown).
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/scouting", r.listScoutCandidates).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/scouting", r.addScoutCandidate).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/scouting/{candidateId}", r.updateScoutCandidate).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/scouting/{candidateId}/select", r.selectScoutCandidate).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/scouting/{candidateId}", r.removeScoutCandidate).Methods("DELETE")

	// Shot list & storyboards — the director's shots for each scene, one
	// optional storyboard frame image per shot. Scenes themselves are
	// derived live from the script text on the frontend, same as
	// breakdown/casting/scouting.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/shots", r.listShots).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/shots", r.addShot).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/shots/{shotId}", r.updateShot).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/shots/{shotId}", r.removeShot).Methods("DELETE")

	// Rehearsals — Phase 2 (Pre-Production) "Design & Prep" gap: a
	// lightweight, position-ordered log of rehearsal sessions per script.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/rehearsals", r.listRehearsals).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/rehearsals", r.addRehearsal).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/rehearsals/{rehearsalId}", r.updateRehearsal).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/rehearsals/{rehearsalId}", r.removeRehearsal).Methods("DELETE")

	// Music & VFX — two lightweight suggestion lists per scene (kind =
	// "music" | "vfx"), same shape either way: a description, a simple
	// progress status, and notes.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/music-vfx", r.listMusicVfxNotes).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/music-vfx", r.addMusicVfxNote).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/music-vfx/{noteId}", r.updateMusicVfxNote).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/music-vfx/{noteId}", r.removeMusicVfxNote).Methods("DELETE")

	// Continuity notes — Phase 3 (Production) script-supervisor gap: a
	// per-scene log of props/costume/eyeline details between takes.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/continuity", r.listContinuityNotes).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/continuity", r.addContinuityNote).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/continuity/{noteId}", r.updateContinuityNote).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/continuity/{noteId}", r.removeContinuityNote).Methods("DELETE")

	// Press kit — Phase 5 (Distribution & Release): director's statement,
	// poster, and a stills list live here; synopsis/logline are read
	// from the Story Bible (Phase 1) rather than duplicated, and cast/
	// crew bios are keyed against the existing casting/crew records.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit", r.getPressKit).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit", r.setPressKit).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit/stills", r.addPressKitStill).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit/stills/{stillId}", r.updatePressKitStill).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit/stills/{stillId}", r.removePressKitStill).Methods("DELETE")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/press-kit/bios/{kind}/{personId}", r.setPressKitBio).Methods("PUT")

	// Milestones — Phase 4 (Post-Production): a lightweight, ordered
	// checklist of post stages (rough cut, picture lock, sound mix,
	// color grade, final export, etc.), each with a status and notes.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/milestones", r.listMilestones).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/milestones", r.addMilestone).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/milestones/{milestoneId}", r.updateMilestone).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/milestones/{milestoneId}", r.removeMilestone).Methods("DELETE")

	// Festival & release tracker — Phase 5 (Distribution & Release):
	// festival submissions (deadline, fee, status, premiere-rule flag)
	// and online release links (platform, URL, release date). Two
	// independent lists shown together in one drawer.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/festivals", r.listFestivals).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/festivals", r.addFestival).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/festivals/{festivalId}", r.updateFestival).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/festivals/{festivalId}", r.removeFestival).Methods("DELETE")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/release-links", r.listReleaseLinks).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/release-links", r.addReleaseLink).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/release-links/{linkId}", r.updateReleaseLink).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/release-links/{linkId}", r.removeReleaseLink).Methods("DELETE")

	// Credits — Phase 4 (Post-Production), "Titles & Credits": cast and
	// crew are pulled live (same as the press kit), plus a freeform
	// block for anything else (music licences, location
	// acknowledgements, funding/sponsor logos).
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/credits", r.getCredits).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/credits", r.setCredits).Methods("PUT")

	// Crew — the below-the-line production team, distinct from
	// project_members (crew members aren't Bulwriter accounts).
	api.HandleFunc("/projects/{projectId}/crew", r.listCrew).Methods("GET")
	api.HandleFunc("/projects/{projectId}/crew", r.addCrewMember).Methods("POST")
	api.HandleFunc("/projects/{projectId}/crew/{memberId}", r.updateCrewMember).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/crew/{memberId}", r.removeCrewMember).Methods("DELETE")

	// Recovers a panic in any handler and reports it to Sentry (a no-op
	// if SENTRY_DSN isn't set) before returning 500 — net/http's own
	// per-request recovery already stops one panicking request from
	// taking the whole process down, but without this the panic just
	// vanishes into Railway's logs with nothing tracking it.
	sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: false})
	return sentryHandler.Handle(c.Handler(mx))
}

// ── Helpers ──────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	if status >= http.StatusInternalServerError {
		// A 5xx here is an actual bug or infra failure (a panic is
		// caught separately by the sentryhttp middleware wrapping the
		// whole router) — worth alerting on. A no-op if SENTRY_DSN
		// isn't configured.
		sentry.CaptureMessage(msg)
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

// ── Handlers ─────────────────────────────────────────────────────────

func (r *router) wsUpgrade(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	r.hub.ServeWS(w, req, vars["scriptId"])
}

func (r *router) listProjects(w http.ResponseWriter, req *http.Request) {
	userID := middleware.UserIDFromContext(req)

	ids, err := r.members.ProjectIDsForUser(userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	projects, err := r.projects.ListByIDs(ids)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (r *router) createProject(w http.ResponseWriter, req *http.Request) {
	userID := middleware.UserIDFromContext(req)

	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}

	p, err := r.projects.Create(body.Title, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Creator becomes the owner — first row in project_members
	if err := r.members.AddMember(p.ID, userID, "owner"); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, p)
}

func (r *router) getProject(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	p, err := r.projects.Get(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (r *router) listScripts(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	scripts, err := r.scripts.List(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, scripts)
}

func (r *router) createScript(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	// Check the user has at least editor role on this project
	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}
	// Create script
	sc, err := r.scripts.Create(vars["projectId"], body.Title)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create branch
	// br, err := r.store.CreateBranch(sc.ID, "main", "")
	// if err != nil {
	// 	writeErr(w, http.StatusInternalServerError, err.Error())
	// 	return
	// }

	// writeJSON(w, http.StatusCreated, br)
	// snap, err := r.store.Commit(sc.ID, br.ID, "", "Once upon a time...", userID)
	// if err != nil {
	// 	writeErr(w, http.StatusInternalServerError, err.Error())
	// 	return
	// }

	writeJSON(w, http.StatusCreated, sc)
}

func (r *router) getScript(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	sc, err := r.scripts.Get(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sc)
}

// renameProject updates a project's title — same editor-or-above bar as
// creating a script, since it's a much less drastic action than deleting
// or restoring the project itself.
func (r *router) renameProject(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}

	if err := r.projects.Rename(vars["projectId"], body.Title); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// renameScript is renameProject's script-level equivalent.
func (r *router) renameScript(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Title == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}

	if err := r.scripts.Rename(vars["scriptId"], body.Title); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteProject moves a project to the trash — permanently deleting a
// whole project (and everything under it) is a big enough action that
// only the owner can do it, unlike scripts which any editor can delete.
func (r *router) deleteProject(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleOwner) {
		return
	}

	if err := r.projects.SoftDelete(vars["projectId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listTrashedProjects(w http.ResponseWriter, req *http.Request) {
	userID := middleware.UserIDFromContext(req)

	ids, err := r.members.ProjectIDsForUser(userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	projects, err := r.projects.ListTrashByIDs(ids)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (r *router) restoreProject(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleOwner) {
		return
	}

	if err := r.projects.Restore(vars["projectId"]); err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// purgeProjectNow permanently deletes an already-trashed project
// immediately, skipping the rest of its 30-day retention window — the
// trash view's "Delete forever" action.
func (r *router) purgeProjectNow(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleOwner) {
		return
	}

	if err := r.trash.PurgeProjectNow(vars["projectId"]); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteScript moves a script to the trash — same editor-or-above bar as
// creating one.
func (r *router) deleteScript(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.scripts.SoftDelete(vars["scriptId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listTrashedScripts(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	scripts, err := r.scripts.ListTrash(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if scripts == nil {
		scripts = []*script.Script{}
	}
	writeJSON(w, http.StatusOK, scripts)
}

func (r *router) restoreScript(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.scripts.Restore(vars["scriptId"]); err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// purgeScriptNow is purgeProjectNow's script-level equivalent.
func (r *router) purgeScriptNow(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.trash.PurgeScriptNow(vars["scriptId"]); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listBranches(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	branches, err := r.store.ListBranches(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if branches == nil {
		branches = []*snapshot.Branch{}
	}
	writeJSON(w, http.StatusOK, branches)
}

func (r *router) createBranch(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	var body struct {
		Name           string `json:"name"`
		FromSnapshotID string `json:"fromSnapshotId"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	branch, err := r.store.CreateBranch(vars["scriptId"], body.Name, body.FromSnapshotID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, branch)
}

func (r *router) commit(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	var body struct {
		Content string `json:"content"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	snap, err := r.store.Commit(vars["scriptId"], vars["branchId"], body.Content, body.Message, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, snap)
}

// saveDraft is what auto-save calls — see Store.SaveDraft. Unlike commit,
// it never touches the snapshot history or the branch tip.
func (r *router) saveDraft(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := r.store.SaveDraft(vars["branchId"], body.Content); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) history(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	branch, err := r.store.GetBranch(vars["branchId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	chain, err := r.store.History(branch.TipID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if chain == nil {
		chain = []*snapshot.Snapshot{}
	}
	writeJSON(w, http.StatusOK, chain)
}

func (r *router) getSnapshot(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	snap, err := r.store.GetSnapshot(vars["snapshotId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func (r *router) diff(w http.ResponseWriter, req *http.Request) {
	from := req.URL.Query().Get("from")
	to := req.URL.Query().Get("to")
	if from == "" || to == "" {
		writeErr(w, http.StatusBadRequest, "from and to query params required")
		return
	}
	lines, err := r.store.Diff(from, to)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, lines)
}

func (r *router) listBreakdown(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	items, err := r.breakdown.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []*breakdown.SceneBreakdown{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (r *router) upsertBreakdown(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		SceneKey    string   `json:"sceneKey"`
		Props       []string `json:"props"`
		Costumes    []string `json:"costumes"`
		SetDressing []string `json:"setDressing"`
		Notes       string   `json:"notes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.SceneKey == "" {
		writeErr(w, http.StatusBadRequest, "sceneKey is required")
		return
	}

	b, err := r.breakdown.Upsert(vars["scriptId"], body.SceneKey, body.Props, body.Costumes, body.SetDressing, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (r *router) listCasting(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	candidates, err := r.casting.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if candidates == nil {
		candidates = []*casting.Candidate{}
	}
	writeJSON(w, http.StatusOK, candidates)
}

type castingCandidateBody struct {
	CharacterName string `json:"characterName"`
	ActorName     string `json:"actorName"`
	Contact       string `json:"contact"`
	Status        string `json:"status"`
	Notes         string `json:"notes"`
}

func (r *router) addCastingCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body castingCandidateBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.CharacterName == "" {
		writeErr(w, http.StatusBadRequest, "characterName is required")
		return
	}

	c, err := r.casting.Add(vars["scriptId"], body.CharacterName, body.ActorName, body.Contact, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (r *router) updateCastingCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body castingCandidateBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	c, err := r.casting.Update(vars["scriptId"], vars["candidateId"], body.ActorName, body.Contact, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (r *router) castCastingCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.casting.Cast(vars["scriptId"], vars["candidateId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *router) removeCastingCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.casting.Remove(vars["scriptId"], vars["candidateId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type scheduleResponse struct {
	Strips []*schedule.Strip   `json:"strips"`
	Days   []*schedule.DayMeta `json:"days"`
}

func (r *router) getSchedule(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)

	strips, err := r.schedule.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if strips == nil {
		strips = []*schedule.Strip{}
	}

	days, err := r.schedule.ListDays(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if days == nil {
		days = []*schedule.DayMeta{}
	}

	writeJSON(w, http.StatusOK, scheduleResponse{Strips: strips, Days: days})
}

func (r *router) replaceSchedule(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Strips []schedule.StripInput   `json:"strips"`
		Days   []schedule.DayMetaInput `json:"days"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	strips, days, err := r.schedule.Replace(vars["scriptId"], body.Strips, body.Days)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, scheduleResponse{Strips: strips, Days: days})
}

type budgetResponse struct {
	Estimate  *budget.Estimate   `json:"estimate"`
	LineItems []*budget.LineItem `json:"lineItems"`
}

func (r *router) getBudget(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)

	estimate, err := r.budget.GetEstimate(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	items, err := r.budget.ListLineItems(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []*budget.LineItem{}
	}

	writeJSON(w, http.StatusOK, budgetResponse{Estimate: estimate, LineItems: items})
}

func (r *router) setBudgetEstimate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		DayRate      float64 `json:"dayRate"`
		LocationRate float64 `json:"locationRate"`
		CastRate     float64 `json:"castRate"`
		PropRate     float64 `json:"propRate"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	estimate, err := r.budget.SetEstimate(vars["scriptId"], body.DayRate, body.LocationRate, body.CastRate, body.PropRate)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, estimate)
}

func (r *router) addBudgetLineItem(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Label  string  `json:"label"`
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Label == "" {
		writeErr(w, http.StatusBadRequest, "label is required")
		return
	}

	item, err := r.budget.AddLineItem(vars["scriptId"], body.Label, body.Amount)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (r *router) removeBudgetLineItem(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.budget.RemoveLineItem(vars["scriptId"], vars["itemId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type storyScriptRow struct {
	ScriptID string `json:"scriptId"`
	Title    string `json:"title"`
	Logline  string `json:"logline"`
	Synopsis string `json:"synopsis"`
}

type storyResponse struct {
	Bible     *story.Bible      `json:"bible"`
	IdeaNotes []*story.IdeaNote `json:"ideaNotes"`
	Scripts   []storyScriptRow  `json:"scripts"`
}

func (r *router) getStory(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	projectID := vars["projectId"]

	bible, err := r.story.GetBible(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	notes, err := r.story.ListIdeaNotes(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if notes == nil {
		notes = []*story.IdeaNote{}
	}

	scripts, err := r.scripts.List(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	stories, err := r.story.ListScriptStories(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	storyByScriptID := make(map[string]*story.ScriptStory, len(stories))
	for _, ss := range stories {
		storyByScriptID[ss.ScriptID] = ss
	}

	rows := make([]storyScriptRow, 0, len(scripts))
	for _, sc := range scripts {
		row := storyScriptRow{ScriptID: sc.ID, Title: sc.Title}
		if ss, ok := storyByScriptID[sc.ID]; ok {
			row.Logline = ss.Logline
			row.Synopsis = ss.Synopsis
		}
		rows = append(rows, row)
	}

	writeJSON(w, http.StatusOK, storyResponse{Bible: bible, IdeaNotes: notes, Scripts: rows})
}

// generateStoryBible sends an uploaded document's already-extracted text
// to Claude and returns a draft set of story bible fields — genre, tone,
// theme, core question, logline, synopsis. It never writes to the
// database itself; the frontend shows the draft for the writer to review
// and edit, then saves it through the normal setStoryBible/setScriptStory
// endpoints like any other edit.
func (r *router) generateStoryBible(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	// A document's extracted text is JSON-encoded prose, not an image, but
	// the same size guard applies for the same reason — bound how much a
	// single request can make the server (and, here, the Claude API call)
	// buffer before it's even decoded.
	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || strings.TrimSpace(body.Text) == "" {
		writeErr(w, http.StatusBadRequest, "text is required, and the payload must fit within the size limit")
		return
	}

	draft, err := r.anthropic.GenerateStoryBible(body.Text)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

// createDonationCheckout starts a Stripe-hosted Checkout session for a
// one-time or monthly donation and hands back its URL for the browser to
// redirect to. Public — no signed-in Bulwriter account required.
func (r *router) createDonationCheckout(w http.ResponseWriter, req *http.Request) {
	req.Body = http.MaxBytesReader(w, req.Body, 4096)
	var body struct {
		AmountCents int    `json:"amountCents"`
		Interval    string `json:"interval"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	url, err := r.donations.CreateCheckoutSession(body.AmountCents, body.Interval)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// maxWebhookBodyBytes bounds a Stripe webhook payload — actual events
// are a few KB; this is generous headroom, not a real limit.
const maxWebhookBodyBytes = 64 << 10

// stripeWebhook receives Stripe's server-to-server confirmation that a
// checkout session actually completed — the client-side success
// redirect on its own proves nothing (a user can hit that URL by hand
// without ever paying), so this is the only real source of truth for
// "a donation succeeded."
func (r *router) stripeWebhook(w http.ResponseWriter, req *http.Request) {
	req.Body = http.MaxBytesReader(w, req.Body, maxWebhookBodyBytes)
	body, err := io.ReadAll(req.Body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "could not read request body")
		return
	}

	checkout, err := r.donations.ParseCompletedCheckout(body, req.Header.Get("Stripe-Signature"))
	if err != nil {
		// Covers both a bad/forged signature and a malformed payload —
		// either way this wasn't a legitimate Stripe delivery, so 400
		// rather than 200 (Stripe won't retry a request it sent
		// correctly, but there's nothing to retry here either way).
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if checkout == nil {
		// An event we don't act on (wrong type, or not yet paid) —
		// not an error, just nothing to record.
		w.WriteHeader(http.StatusOK)
		return
	}

	if err := r.donationsStore.RecordCompleted(*checkout); err != nil {
		// 5xx makes Stripe retry delivery, which is what we want if
		// this was a transient database error.
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (r *router) setStoryBible(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		CoreQuestion string `json:"coreQuestion"`
		Genre        string `json:"genre"`
		Tone         string `json:"tone"`
		Theme        string `json:"theme"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	bible, err := r.story.SetBible(vars["projectId"], body.CoreQuestion, body.Genre, body.Tone, body.Theme)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, bible)
}

func (r *router) addStoryIdeaNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Text == "" {
		writeErr(w, http.StatusBadRequest, "text is required")
		return
	}

	note, err := r.story.AddIdeaNote(vars["projectId"], body.Text)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, note)
}

func (r *router) updateStoryIdeaNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Text == "" {
		writeErr(w, http.StatusBadRequest, "text is required")
		return
	}

	note, err := r.story.UpdateIdeaNote(vars["projectId"], vars["noteId"], body.Text)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, note)
}

func (r *router) removeStoryIdeaNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.story.RemoveIdeaNote(vars["projectId"], vars["noteId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) setScriptStory(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Logline  string `json:"logline"`
		Synopsis string `json:"synopsis"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	ss, err := r.story.SetScriptStory(vars["scriptId"], body.Logline, body.Synopsis)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ss)
}

// memberWithProfile adds Clerk-sourced display info (name/email/avatar) on
// top of the stored membership row — the DB only ever holds userID/role,
// since Clerk is the source of truth for profile data. Enrichment is
// best-effort: r.clerk.GetProfile silently returns nil when no secret key
// is configured or Clerk doesn't recognize the user, leaving these fields
// empty rather than failing the whole members list over one bad lookup.
type memberWithProfile struct {
	*membership.Member
	Name     string `json:"name,omitempty"`
	Email    string `json:"email,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"`
}

func (r *router) listMembers(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	members, err := r.members.ListMembers(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	enriched := make([]memberWithProfile, len(members))
	for i, m := range members {
		mp := memberWithProfile{Member: m}
		if profile, err := r.clerk.GetProfile(m.UserID); err == nil && profile != nil {
			mp.Name = profile.Name
			mp.Email = profile.Email
			mp.ImageURL = profile.ImageURL
		}
		enriched[i] = mp
	}
	writeJSON(w, http.StatusOK, enriched)
}

func (r *router) listInvites(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	invites, err := r.members.ListInvites(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, invites)
}

func (r *router) createInvite(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	// Check the user has at least editor role on this project
	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleOwner) {
		return
	}

	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Email == "" {
		writeErr(w, http.StatusBadRequest, "email is required")
		return
	}

	// Already a collaborator? Resolve the email to a Clerk account (if
	// any) and check membership directly, rather than letting a second
	// invite silently pile up for someone already on the project.
	if uid, err := r.clerk.FindUserIDByEmail(body.Email); err == nil && uid != "" {
		if isMember, err := r.members.IsMember(vars["projectId"], uid); err == nil && isMember {
			writeErr(w, http.StatusConflict, "this person is already a collaborator")
			return
		}
	}

	// Already invited and still pending? Don't stack duplicate invites.
	if existing, err := r.members.ListInvites(vars["projectId"]); err == nil {
		for _, inv := range existing {
			if inv.Status == "pending" && strings.EqualFold(inv.Email, body.Email) {
				writeErr(w, http.StatusConflict, "an invite is already pending for this email")
				return
			}
		}
	}

	// Default role if not specified
	role2 := body.Role
	if role2 == "" {
		role2 = "editor"
	}

	inv, err := r.members.CreateInvite(vars["projectId"], body.Email, role2)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, inv)
}

// inviteWithProject adds the project's title to an invite, so the invited
// user can tell which project it's for without a separate lookup.
type inviteWithProject struct {
	*membership.Invite
	ProjectTitle string `json:"projectTitle,omitempty"`
}

func (r *router) listMyInvites(w http.ResponseWriter, req *http.Request) {
	email := middleware.UserEmailFromContext(req)
	if email == "" {
		writeJSON(w, http.StatusOK, []inviteWithProject{})
		return
	}

	invites, err := r.members.ListInvitesForEmail(email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	enriched := make([]inviteWithProject, len(invites))
	for i, inv := range invites {
		iw := inviteWithProject{Invite: inv}
		if p, err := r.projects.Get(inv.ProjectID); err == nil && p != nil {
			iw.ProjectTitle = p.Title
		}
		enriched[i] = iw
	}
	writeJSON(w, http.StatusOK, enriched)
}

func (r *router) acceptInvite(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)
	email := middleware.UserEmailFromContext(req)

	inv, err := r.members.GetInvite(vars["inviteId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	if email == "" || !strings.EqualFold(inv.Email, email) {
		writeErr(w, http.StatusForbidden, "this invite isn't addressed to you")
		return
	}

	updated, err := r.members.AcceptInvite(inv.ID, userID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (r *router) declineInvite(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	email := middleware.UserEmailFromContext(req)

	inv, err := r.members.GetInvite(vars["inviteId"])
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	if email == "" || !strings.EqualFold(inv.Email, email) {
		writeErr(w, http.StatusForbidden, "this invite isn't addressed to you")
		return
	}

	if err := r.members.DeclineInvite(inv.ID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
}

// maxImageUploadBytes bounds the request body for any handler that
// accepts a data-URI image (press kit stills/poster, shot storyboards,
// scouting photos, etc.) — the client resizes/compresses images before
// upload, so this is generous headroom for the resulting data URI, not
// a budget for raw uploads.
const maxImageUploadBytes = 6 << 20

func (r *router) listScoutCandidates(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	candidates, err := r.scouting.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if candidates == nil {
		candidates = []*scouting.Candidate{}
	}
	writeJSON(w, http.StatusOK, candidates)
}

func (r *router) listCrew(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	members, err := r.crew.List(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if members == nil {
		members = []*crew.Member{}
	}
	writeJSON(w, http.StatusOK, members)
}

type scoutCandidateBody struct {
	LocationKey   string `json:"locationKey"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	Notes         string `json:"notes"`
	Photo         string `json:"photo"`
	PhotoFilename string `json:"photoFilename"`
}

func (r *router) addScoutCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body scoutCandidateBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.LocationKey == "" {
		writeErr(w, http.StatusBadRequest, "locationKey is required, and the payload must fit within the size limit")
		return
	}

	c, err := r.scouting.Add(vars["scriptId"], body.LocationKey, body.Name, body.Address, body.Notes, body.Photo, body.PhotoFilename)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (r *router) addCrewMember(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Role    string `json:"role"`
		Name    string `json:"name"`
		Contact string `json:"contact"`
		Notes   string `json:"notes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}

	m, err := r.crew.Add(vars["projectId"], body.Role, body.Name, body.Contact, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (r *router) updateScoutCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body scoutCandidateBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large payload")
		return
	}

	c, err := r.scouting.Update(vars["scriptId"], vars["candidateId"], body.Name, body.Address, body.Notes, body.Photo, body.PhotoFilename)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (r *router) updateCrewMember(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		Role    string `json:"role"`
		Name    string `json:"name"`
		Contact string `json:"contact"`
		Notes   string `json:"notes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}

	m, err := r.crew.Update(vars["projectId"], vars["memberId"], body.Role, body.Name, body.Contact, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (r *router) selectScoutCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.scouting.Select(vars["scriptId"], vars["candidateId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *router) removeScoutCandidate(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.scouting.Remove(vars["scriptId"], vars["candidateId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listShots(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	shots, err := r.shots.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if shots == nil {
		shots = []*shotlist.Shot{}
	}
	writeJSON(w, http.StatusOK, shots)
}

type shotBody struct {
	SceneKey       string `json:"sceneKey"`
	ShotSize       string `json:"shotSize"`
	CameraAngle    string `json:"cameraAngle"`
	CameraMovement string `json:"cameraMovement"`
	Description    string `json:"description"`
	Image          string `json:"image"`
	ImageFilename  string `json:"imageFilename"`
}

func (r *router) addShot(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body shotBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.SceneKey == "" {
		writeErr(w, http.StatusBadRequest, "sceneKey is required, and the payload must fit within the size limit")
		return
	}

	sh, err := r.shots.Add(vars["scriptId"], body.SceneKey, body.ShotSize, body.CameraAngle, body.CameraMovement, body.Description, body.Image, body.ImageFilename)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, sh)
}

func (r *router) updateShot(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body shotBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large payload")
		return
	}

	sh, err := r.shots.Update(vars["scriptId"], vars["shotId"], body.ShotSize, body.CameraAngle, body.CameraMovement, body.Description, body.Image, body.ImageFilename)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sh)
}

func (r *router) removeShot(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.shots.Remove(vars["scriptId"], vars["shotId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listMusicVfxNotes(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	notes, err := r.musicvfx.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if notes == nil {
		notes = []*musicvfx.Note{}
	}
	writeJSON(w, http.StatusOK, notes)
}

type musicVfxNoteBody struct {
	SceneKey    string `json:"sceneKey"`
	Kind        string `json:"kind"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Notes       string `json:"notes"`
}

func (r *router) addMusicVfxNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body musicVfxNoteBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.SceneKey == "" || (body.Kind != "music" && body.Kind != "vfx") {
		writeErr(w, http.StatusBadRequest, "sceneKey is required and kind must be \"music\" or \"vfx\"")
		return
	}

	n, err := r.musicvfx.Add(vars["scriptId"], body.SceneKey, body.Kind, body.Description, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, n)
}

func (r *router) updateMusicVfxNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body musicVfxNoteBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	n, err := r.musicvfx.Update(vars["scriptId"], vars["noteId"], body.Description, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, n)
}

func (r *router) removeMusicVfxNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.musicvfx.Remove(vars["scriptId"], vars["noteId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type pressKitCastRow struct {
	CandidateID   string `json:"candidateId"`
	CharacterName string `json:"characterName"`
	ActorName     string `json:"actorName"`
	Bio           string `json:"bio"`
}

type pressKitCrewRow struct {
	MemberID string `json:"memberId"`
	Role     string `json:"role"`
	Name     string `json:"name"`
	Bio      string `json:"bio"`
}

type pressKitResponse struct {
	PressKit *presskit.PressKit `json:"pressKit"`
	Stills   []*presskit.Still  `json:"stills"`
	Logline  string             `json:"logline"`
	Synopsis string             `json:"synopsis"`
	Cast     []pressKitCastRow  `json:"cast"`
	Crew     []pressKitCrewRow  `json:"crew"`
}

func (r *router) getPressKit(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	projectID := vars["projectId"]
	scriptID := vars["scriptId"]

	pk, err := r.presskit.GetPressKit(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	stills, err := r.presskit.ListStills(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if stills == nil {
		stills = []*presskit.Still{}
	}

	bios, err := r.presskit.ListBios(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	bioByKey := make(map[string]string, len(bios))
	for _, b := range bios {
		bioByKey[b.Kind+":"+b.PersonID] = b.Bio
	}

	ss, err := r.story.GetScriptStory(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	candidates, err := r.casting.List(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	cast := make([]pressKitCastRow, 0, len(candidates))
	for _, c := range candidates {
		if !c.IsCast {
			continue
		}
		cast = append(cast, pressKitCastRow{
			CandidateID: c.ID, CharacterName: c.CharacterName, ActorName: c.ActorName,
			Bio: bioByKey["cast:"+c.ID],
		})
	}

	members, err := r.crew.List(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	crewRows := make([]pressKitCrewRow, 0, len(members))
	for _, m := range members {
		crewRows = append(crewRows, pressKitCrewRow{
			MemberID: m.ID, Role: m.Role, Name: m.Name,
			Bio: bioByKey["crew:"+m.ID],
		})
	}

	writeJSON(w, http.StatusOK, pressKitResponse{
		PressKit: pk, Stills: stills, Logline: ss.Logline, Synopsis: ss.Synopsis, Cast: cast, Crew: crewRows,
	})
}

func (r *router) setPressKit(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body struct {
		DirectorStatement string `json:"directorStatement"`
		Poster            string `json:"poster"`
		PosterFilename    string `json:"posterFilename"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large payload")
		return
	}

	pk, err := r.presskit.SetPressKit(vars["scriptId"], body.DirectorStatement, body.Poster, body.PosterFilename)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pk)
}

type pressKitStillBody struct {
	Image         string `json:"image"`
	ImageFilename string `json:"imageFilename"`
	Caption       string `json:"caption"`
}

func (r *router) addPressKitStill(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body pressKitStillBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large payload")
		return
	}

	st, err := r.presskit.AddStill(vars["scriptId"], body.Image, body.ImageFilename, body.Caption)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, st)
}

func (r *router) updatePressKitStill(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	req.Body = http.MaxBytesReader(w, req.Body, maxImageUploadBytes)
	var body pressKitStillBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large payload")
		return
	}

	st, err := r.presskit.UpdateStill(vars["scriptId"], vars["stillId"], body.Image, body.ImageFilename, body.Caption)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (r *router) removePressKitStill(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.presskit.RemoveStill(vars["scriptId"], vars["stillId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) setPressKitBio(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	kind := vars["kind"]
	if kind != "cast" && kind != "crew" {
		writeErr(w, http.StatusBadRequest, `kind must be "cast" or "crew"`)
		return
	}

	var body struct {
		Bio string `json:"bio"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	b, err := r.presskit.SetBio(vars["scriptId"], kind, vars["personId"], body.Bio)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (r *router) removeCrewMember(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.crew.Remove(vars["projectId"], vars["memberId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) getMyRole(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if role == "" {
		writeErr(w, http.StatusForbidden, "not a member")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": role})
}

func (r *router) listMilestones(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	milestones, err := r.milestones.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if milestones == nil {
		milestones = []*milestone.Milestone{}
	}
	writeJSON(w, http.StatusOK, milestones)
}

type milestoneBody struct {
	Label  string `json:"label"`
	Status string `json:"status"`
	Notes  string `json:"notes"`
}

func (r *router) addMilestone(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body milestoneBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Label == "" {
		writeErr(w, http.StatusBadRequest, "label is required")
		return
	}

	m, err := r.milestones.Add(vars["scriptId"], body.Label, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (r *router) updateMilestone(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body milestoneBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	m, err := r.milestones.Update(vars["scriptId"], vars["milestoneId"], body.Label, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (r *router) removeMilestone(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.milestones.Remove(vars["scriptId"], vars["milestoneId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listFestivals(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	festivals, err := r.distribution.ListFestivals(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if festivals == nil {
		festivals = []*distribution.FestivalSubmission{}
	}
	writeJSON(w, http.StatusOK, festivals)
}

type festivalBody struct {
	FestivalName     string  `json:"festivalName"`
	Deadline         string  `json:"deadline"`
	Fee              float64 `json:"fee"`
	Status           string  `json:"status"`
	PremiereRequired bool    `json:"premiereRequired"`
	Notes            string  `json:"notes"`
}

func (r *router) addFestival(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body festivalBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.FestivalName == "" {
		writeErr(w, http.StatusBadRequest, "festivalName is required")
		return
	}

	f, err := r.distribution.AddFestival(vars["scriptId"], body.FestivalName, body.Deadline, body.Fee, body.Status, body.PremiereRequired, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (r *router) updateFestival(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body festivalBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	f, err := r.distribution.UpdateFestival(
		vars["scriptId"], vars["festivalId"], body.FestivalName, body.Deadline, body.Fee, body.Status, body.PremiereRequired, body.Notes,
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, f)
}

func (r *router) removeFestival(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.distribution.RemoveFestival(vars["scriptId"], vars["festivalId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listReleaseLinks(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	links, err := r.distribution.ListReleaseLinks(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if links == nil {
		links = []*distribution.ReleaseLink{}
	}
	writeJSON(w, http.StatusOK, links)
}

type releaseLinkBody struct {
	Platform    string `json:"platform"`
	URL         string `json:"url"`
	ReleaseDate string `json:"releaseDate"`
	Notes       string `json:"notes"`
}

func (r *router) addReleaseLink(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body releaseLinkBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.Platform == "" {
		writeErr(w, http.StatusBadRequest, "platform is required")
		return
	}

	l, err := r.distribution.AddReleaseLink(vars["scriptId"], body.Platform, body.URL, body.ReleaseDate, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

func (r *router) updateReleaseLink(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body releaseLinkBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	l, err := r.distribution.UpdateReleaseLink(vars["scriptId"], vars["linkId"], body.Platform, body.URL, body.ReleaseDate, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, l)
}

func (r *router) removeReleaseLink(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.distribution.RemoveReleaseLink(vars["scriptId"], vars["linkId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type creditsCastRow struct {
	CharacterName string `json:"characterName"`
	ActorName     string `json:"actorName"`
}

type creditsCrewRow struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

type creditsResponse struct {
	Credits *credits.Credits `json:"credits"`
	Cast    []creditsCastRow `json:"cast"`
	Crew    []creditsCrewRow `json:"crew"`
}

func (r *router) getCredits(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	projectID := vars["projectId"]
	scriptID := vars["scriptId"]

	c, err := r.credits.Get(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	candidates, err := r.casting.List(scriptID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	cast := make([]creditsCastRow, 0, len(candidates))
	for _, cand := range candidates {
		if !cand.IsCast {
			continue
		}
		cast = append(cast, creditsCastRow{CharacterName: cand.CharacterName, ActorName: cand.ActorName})
	}

	members, err := r.crew.List(projectID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	crewRows := make([]creditsCrewRow, 0, len(members))
	for _, m := range members {
		crewRows = append(crewRows, creditsCrewRow{Name: m.Name, Role: m.Role})
	}

	writeJSON(w, http.StatusOK, creditsResponse{Credits: c, Cast: cast, Crew: crewRows})
}

func (r *router) setCredits(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body struct {
		AdditionalCredits string `json:"additionalCredits"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	c, err := r.credits.Set(vars["scriptId"], body.AdditionalCredits)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (r *router) listRehearsals(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	list, err := r.rehearsals.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []*rehearsal.Rehearsal{}
	}
	writeJSON(w, http.StatusOK, list)
}

type rehearsalBody struct {
	Date  string `json:"date"`
	Time  string `json:"time"`
	Focus string `json:"focus"`
	Notes string `json:"notes"`
}

func (r *router) addRehearsal(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body rehearsalBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	re, err := r.rehearsals.Add(vars["scriptId"], body.Date, body.Time, body.Focus, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, re)
}

func (r *router) updateRehearsal(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body rehearsalBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	re, err := r.rehearsals.Update(vars["scriptId"], vars["rehearsalId"], body.Date, body.Time, body.Focus, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, re)
}

func (r *router) removeRehearsal(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.rehearsals.Remove(vars["scriptId"], vars["rehearsalId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (r *router) listContinuityNotes(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	notes, err := r.continuity.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if notes == nil {
		notes = []*continuity.Note{}
	}
	writeJSON(w, http.StatusOK, notes)
}

type continuityNoteBody struct {
	SceneKey string `json:"sceneKey"`
	Take     string `json:"take"`
	Note     string `json:"note"`
	Flagged  bool   `json:"flagged"`
}

func (r *router) addContinuityNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body continuityNoteBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.SceneKey == "" {
		writeErr(w, http.StatusBadRequest, "sceneKey is required")
		return
	}

	n, err := r.continuity.Add(vars["scriptId"], body.SceneKey, body.Take, body.Note, body.Flagged)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, n)
}

func (r *router) updateContinuityNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	var body continuityNoteBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	n, err := r.continuity.Update(vars["scriptId"], vars["noteId"], body.Take, body.Note, body.Flagged)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, n)
}

func (r *router) removeContinuityNote(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	userID := middleware.UserIDFromContext(req)

	role, err := r.members.GetRole(vars["projectId"], userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !middleware.RequireRole(w, role, middleware.RoleEditor) {
		return
	}

	if err := r.continuity.Remove(vars["scriptId"], vars["noteId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
