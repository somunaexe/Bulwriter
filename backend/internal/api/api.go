// api.go — HTTP router
// Wires REST endpoints for version control and the WebSocket upgrade
// for real-time Yjs sync. In production add JWT middleware here.
package api

import (
	"encoding/json"
	"net/http"

	"scriptflow/backend/internal/hub"
	"scriptflow/backend/internal/snapshot"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

type router struct {
	hub   *hub.Hub
	store *snapshot.Store
}

func NewRouter(h *hub.Hub) http.Handler {
	r := &router{
		hub:   h,
		store: snapshot.NewStore(),
	}

	mx := mux.NewRouter()

	// ── Version control ─────────────────────────────────────────────
	// Branches
	mx.HandleFunc("/api/projects/{projectId}/branches", r.listBranches).Methods("GET")
	mx.HandleFunc("/api/projects/{projectId}/branches", r.createBranch).Methods("POST")

	// Snapshots
	mx.HandleFunc("/api/projects/{projectId}/branches/{branchId}/commit", r.commit).Methods("POST")
	mx.HandleFunc("/api/projects/{projectId}/branches/{branchId}/history", r.history).Methods("GET")
	mx.HandleFunc("/api/snapshots/{snapshotId}", r.getSnapshot).Methods("GET")

	// Diff between two snapshots
	mx.HandleFunc("/api/diff", r.diff).Methods("GET") // ?from=<id>&to=<id>

	// ── Real-time sync ───────────────────────────────────────────────
	// Clients connect here: ws://host/ws/{scriptId}
	mx.HandleFunc("/ws/{scriptId}", r.wsUpgrade)

	// CORS — allow Angular dev server
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"http://localhost:4200"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
	})

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

func (r *router) listBranches(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	branches := r.store.ListBranches(vars["projectId"])
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
	branch, err := r.store.CreateBranch(vars["projectId"], body.Name, body.FromSnapshotID)
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
	snap, err := r.store.Commit(vars["projectId"], vars["branchId"], body.Content, body.Message, body.AuthorID)
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
