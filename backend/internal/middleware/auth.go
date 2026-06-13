package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

// We store the key set in memory and refresh it every hour.
// This avoids fetching Clerk's public keys on every single request.
var (
	keySet     jwk.Set
	keySetOnce sync.Once
	keySetMu   sync.RWMutex
	keySetExp  time.Time
)

// contextKey is a private type for context keys — prevents collisions
// with other packages that also store values in context
type contextKey string

const UserIDKey contextKey = "userID"

// fetchKeySet fetches Clerk's public JWKS and caches it for one hour
func fetchKeySet() error {
	jwksURL := fmt.Sprintf(
		"%s/.well-known/jwks.json",
		os.Getenv("CLERK_FRONTEND_API"),
	)

	set, err := jwk.Fetch(context.Background(), jwksURL)
	if err != nil {
		return fmt.Errorf("fetching jwks: %w", err)
	}

	keySetMu.Lock()
	keySet = set
	keySetExp = time.Now().Add(time.Hour)
	keySetMu.Unlock()

	return nil
}

// getKeySet returns the cached key set, refreshing if expired
func getKeySet() (jwk.Set, error) {
	keySetMu.RLock()
	if keySet != nil && time.Now().Before(keySetExp) {
		defer keySetMu.RUnlock()
		return keySet, nil
	}
	keySetMu.RUnlock()

	if err := fetchKeySet(); err != nil {
		return nil, err
	}
	return keySet, nil
}

// RequireAuth is an HTTP middleware that verifies the Clerk JWT token.
// It extracts the user ID and stores it in the request context so
// handlers can access it with UserIDFromContext().
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Let OPTIONS requests through without auth —
		// these are CORS preflight requests from the browser
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		// Extract token from Authorization: Bearer <token>
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		// Get Clerk's public keys
		keys, err := getKeySet()
		if err != nil {
			http.Error(w, `{"error":"could not fetch auth keys"}`, http.StatusInternalServerError)
			return
		}

		// Verify and parse the token
		token, err := jwt.Parse([]byte(tokenStr),
			jwt.WithKeySet(keys),
			jwt.WithValidate(true),
		)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		// Extract the user ID from the `sub` claim (subject)
		// Clerk sets sub to the user's ID e.g. "user_2abc123"
		userID := token.Subject()
		if userID == "" {
			http.Error(w, `{"error":"missing user id in token"}`, http.StatusUnauthorized)
			return
		}

		// Store user ID in context so handlers can read it
		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserIDFromContext retrieves the user ID stored by RequireAuth.
// Returns empty string if not found — handlers should check for this.
func UserIDFromContext(r *http.Request) string {
	id, _ := r.Context().Value(UserIDKey).(string)
	return id
}