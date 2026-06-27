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

var (
	keySet    jwk.Set
	keySetMu  sync.RWMutex
	keySetExp time.Time
)

type contextKey string

const UserIDKey contextKey = "userID"
const UserEmailKey contextKey = "userEmail"

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
	keySetExp = time.Now().Add(time.Minute * 5)
	keySetMu.Unlock()
	return nil
}

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

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		keys, err := getKeySet()
		if err != nil {
			http.Error(w, `{"error":"could not fetch auth keys"}`, http.StatusInternalServerError)
			return
		}

		token, err := jwt.Parse([]byte(tokenStr),
			jwt.WithKeySet(keys),
			jwt.WithValidate(true),
		)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		userID := token.Subject()
		if userID == "" {
			http.Error(w, `{"error":"missing user id in token"}`, http.StatusUnauthorized)
			return
		}

		var email string
		if v, ok := token.Get("email"); ok {
			email, _ = v.(string)
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		ctx = context.WithValue(ctx, UserEmailKey, email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserIDFromContext(r *http.Request) string {
	id, _ := r.Context().Value(UserIDKey).(string)
	return id
}

func UserEmailFromContext(r *http.Request) string {
	email, _ := r.Context().Value(UserEmailKey).(string)
	return email
}