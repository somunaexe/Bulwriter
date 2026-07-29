// api.go — HTTP router
// Wires REST endpoints for version control and the WebSocket upgrade
// for real-time Yjs sync. In production add JWT middleware here.
package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"github.com/somunaexe/bulwriter/backend/internal/breakdown"
	"github.com/somunaexe/bulwriter/backend/internal/casting"
	"github.com/somunaexe/bulwriter/backend/internal/budget"
	"github.com/somunaexe/bulwriter/backend/internal/clerkapi"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
	"github.com/somunaexe/bulwriter/backend/internal/middleware"
	"github.com/somunaexe/bulwriter/backend/internal/project"
	"github.com/somunaexe/bulwriter/backend/internal/schedule"
	"github.com/somunaexe/bulwriter/backend/internal/script"
	"github.com/somunaexe/bulwriter/backend/internal/snapshot"
	"github.com/somunaexe/bulwriter/backend/internal/membership"
	"database/sql"
)

type router struct {
	hub		  *hub.Hub
	store	  *snapshot.Store
	projects  *project.Store
	scripts	  *script.Store
	members   *membership.Store  // ← add this
	breakdown *breakdown.Store
	schedule  *schedule.Store
	casting   *casting.Store
	budget    *budget.Store
	clerk     *clerkapi.Client
}

func NewRouter(h *hub.Hub, db *sql.DB) http.Handler {
	r := &router{
		hub:       h,
		store:     snapshot.NewStore(db),
		projects:  project.NewStore(db),
		scripts:   script.NewStore((db)),
		members:   membership.NewStore(db),
		breakdown: breakdown.NewStore(db),
		schedule:  schedule.NewStore(db),
		casting:   casting.NewStore(db),
		budget:    budget.NewStore(db),
		clerk:     clerkapi.NewClient(),
	}

	mx := mux.NewRouter()

	// Public routes — no auth needed
	
	// Public health check
	mx.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}).Methods("GET")

	// CORS — allow Angular dev server
	c := cors.New(cors.Options{
		AllowedOrigins: []string{
 			"http://localhost:4200",
			"https://*.app.github.dev",
 			"https://d1hspb5r4tyd4l.cloudfront.net",
		},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
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
	// ── Version control ─────────────────────────────────────────────
	// Projects
	api.HandleFunc("/projects", r.listProjects).Methods("GET")
	api.HandleFunc("/projects", r.createProject).Methods("POST")
	api.HandleFunc("/projects/{projectId}", r.getProject).Methods("GET")
	
	// Scripts
	api.HandleFunc("/projects/{projectId}/scripts", r.listScripts).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts", r.createScript).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}", r.getScript).Methods("GET")

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

	// Casting — actor/contact/status per character. Characters
	// themselves are derived live from the script text on the frontend,
	// same as breakdown's locations/cast, not stored here.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting", r.listCasting).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/casting", r.upsertCasting).Methods("PUT")
	// Budget estimator — per-unit rates (day/location/cast/prop, matched
	// against counts the frontend derives from the breakdown/schedule)
	// plus freeform line items for anything else.
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget", r.getBudget).Methods("GET")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget", r.setBudgetEstimate).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget/line-items", r.addBudgetLineItem).Methods("POST")
	api.HandleFunc("/projects/{projectId}/scripts/{scriptId}/budget/line-items/{itemId}", r.removeBudgetLineItem).Methods("DELETE")

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

	// Per-project editor background image (owner only)
	api.HandleFunc("/projects/{projectId}/background", r.setProjectBackground).Methods("PUT")
	api.HandleFunc("/projects/{projectId}/background", r.clearProjectBackground).Methods("DELETE")
	
	return c.Handler(mx)
}

// ── Helpers ──────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
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
		Content  string `json:"content"`
		Message  string `json:"message"`
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
		SceneKey string   `json:"sceneKey"`
		Props    []string `json:"props"`
		Notes    string   `json:"notes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.SceneKey == "" {
		writeErr(w, http.StatusBadRequest, "sceneKey is required")
		return
	}

	b, err := r.breakdown.Upsert(vars["scriptId"], body.SceneKey, body.Props, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (r *router) listCasting(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	roles, err := r.casting.List(vars["scriptId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if roles == nil {
		roles = []*casting.Role{}
	}
	writeJSON(w, http.StatusOK, roles)
}

func (r *router) upsertCasting(w http.ResponseWriter, req *http.Request) {
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
		CharacterName string `json:"characterName"`
		ActorName     string `json:"actorName"`
		Contact       string `json:"contact"`
		Status        string `json:"status"`
		Notes         string `json:"notes"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil || body.CharacterName == "" {
		writeErr(w, http.StatusBadRequest, "characterName is required")
		return
	}

	c, err := r.casting.Upsert(vars["scriptId"], body.CharacterName, body.ActorName, body.Contact, body.Status, body.Notes)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
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

// maxBackgroundImageBytes bounds the request body for a project's
// background image — the client resizes/compresses the image before
// upload, so this is generous headroom for the resulting data URI, not a
// budget for raw uploads.
const maxBackgroundImageBytes = 6 << 20

func (r *router) setProjectBackground(w http.ResponseWriter, req *http.Request) {
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

	req.Body = http.MaxBytesReader(w, req.Body, maxBackgroundImageBytes)
	var body struct {
		Image string `json:"image"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or too large image payload")
		return
	}
	if !strings.HasPrefix(body.Image, "data:image/") {
		writeErr(w, http.StatusBadRequest, "image must be a data URI")
		return
	}

	if err := r.projects.SetBackgroundImage(vars["projectId"], body.Image); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (r *router) clearProjectBackground(w http.ResponseWriter, req *http.Request) {
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

	if err := r.projects.ClearBackgroundImage(vars["projectId"]); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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