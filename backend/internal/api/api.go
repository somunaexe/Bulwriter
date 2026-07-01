// api.go — HTTP router
// Wires REST endpoints for version control and the WebSocket upgrade
// for real-time Yjs sync. In production add JWT middleware here.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"github.com/somunaexe/bulwriter/backend/internal/hub"
	"github.com/somunaexe/bulwriter/backend/internal/middleware"
	"github.com/somunaexe/bulwriter/backend/internal/project"
	"github.com/somunaexe/bulwriter/backend/internal/script"
	"github.com/somunaexe/bulwriter/backend/internal/snapshot"
	"github.com/somunaexe/bulwriter/backend/internal/membership"
	"database/sql"
)

type router struct {
	hub		 *hub.Hub
	store	 *snapshot.Store
	projects *project.Store
	scripts	 *script.Store
	members  *membership.Store  // ← add this
}

func NewRouter(h *hub.Hub, db *sql.DB) http.Handler {
	r := &router{
		hub:      h,
		store:    snapshot.NewStore(db),
		projects: project.NewStore(db),
		scripts:  script.NewStore((db)),
		members:  membership.NewStore(db),
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
			"http://localhost:4301",
			"https://miniature-space-palm-tree-x6v574xw54rhvr4x-4301.app.github.dev",
			"d1hspb5r4tyd4l.cloudfront.net",
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
	api.HandleFunc("/projects/{projectId}/branches", r.listBranches).Methods("GET")
	api.HandleFunc("/projects/{projectId}/branches", r.createBranch).Methods("POST")

	// Snapshots
	api.HandleFunc("/projects/{projectId}/branches/{branchId}/commit", r.commit).Methods("POST")
	api.HandleFunc("/projects/{projectId}/branches/{branchId}/history", r.history).Methods("GET")
	api.HandleFunc("/snapshots/{snapshotId}", r.getSnapshot).Methods("GET")

	// Diff between two snapshots
	api.HandleFunc("/diff", r.diff).Methods("GET") // ?from=<id>&to=<id>

	// Members & Invites
	api.HandleFunc("/projects/{projectId}/members", r.listMembers).Methods("GET")
	api.HandleFunc("/projects/{projectId}/invites", r.listInvites).Methods("GET")
	api.HandleFunc("/projects/{projectId}/invites", r.createInvite).Methods("POST")

	// Roles
	api.HandleFunc("/projects/{projectId}/my-role", r.getMyRole).Methods("GET")
	
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
	email := middleware.UserEmailFromContext(req)

	// Check if this user has any pending invites matching their email,
	// and auto-add them as members if so. Runs on every dashboard load —
	// harmless if there's nothing pending (the query returns no rows).
	if email != "" {
		if err := r.members.AcceptPendingInvites(userID, email); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

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
	br, err := r.store.CreateBranch(sc.ID, "main", "")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, br)
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
	var body struct {
		Content  string `json:"content"`
		Message  string `json:"message"`
		AuthorID string `json:"authorId"`
	}
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	snap, err := r.store.Commit(vars["scriptId"], vars["branchId"], body.Content, body.Message, body.AuthorID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, snap)
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

func (r *router) listMembers(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	members, err := r.members.ListMembers(vars["projectId"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, members)
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

	// Default role if not specified
	role2 := body.Role
	if role2 == "" {
		role2 = "editor"
	}

	inv, err := r.members.CreateInvite(vars["projectId"], body.Email, role)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, inv)
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