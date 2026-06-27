package middleware

import "net/http"

const (
	RoleViewer = "viewer"
	RoleEditor = "editor"
	RoleOwner  = "owner"
)

var roleRank = map[string]int{
	RoleViewer: 1,
	RoleEditor: 2,
	RoleOwner:  3,
}

// HasRole returns true if the given role meets the required minimum.
// e.g. HasRole("owner", "editor") → true (owner has editor permissions)
//      HasRole("viewer", "editor") → false
func HasRole(role, required string) bool {
	return roleRank[role] >= roleRank[required]
}

// RequireRole is a helper for handlers — it checks the user's role
// on a project and writes a 403 if they don't have enough permission.
// Returns true if the check passed, false if it failed (caller should return).
func RequireRole(w http.ResponseWriter, role, required string) bool {
	if HasRole(role, required) {
		return true
	}
	http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
	return false
}