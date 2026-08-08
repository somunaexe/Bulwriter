package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// RateLimiter is a simple in-memory sliding-window limiter keyed by an
// arbitrary string (typically the authenticated user ID). Fine for a
// single backend instance — it doesn't coordinate across replicas, so a
// deployment that scales the backend horizontally would need a shared
// store (e.g. Redis) instead.
type RateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	requests map[string][]time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:    limit,
		window:   window,
		requests: make(map[string][]time.Time),
	}
}

// Allow reports whether another request for this key is allowed right
// now, recording it if so.
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-rl.window)
	kept := pruneBefore(rl.requests[key], cutoff)

	if len(kept) >= rl.limit {
		rl.requests[key] = kept
		return false
	}

	rl.requests[key] = append(kept, time.Now())
	return true
}

// pruneBefore filters times to only those after cutoff, reusing the
// input slice's backing array (safe: we only ever write to an index at
// or behind the one we're reading from).
func pruneBefore(times []time.Time, cutoff time.Time) []time.Time {
	kept := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	return kept
}

// StartCleanup periodically removes keys whose requests have all aged
// out of the window — without this, the map grows by one entry per
// distinct key that has ever made a request, most of which go stale as
// users stop being active. Meant to be called once via `go rl.StartCleanup(...)`.
func (rl *RateLimiter) StartCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-rl.window)
		for key, times := range rl.requests {
			kept := pruneBefore(times, cutoff)
			if len(kept) == 0 {
				delete(rl.requests, key)
			} else {
				rl.requests[key] = kept
			}
		}
		rl.mu.Unlock()
	}
}

// ClientIP is a rate-limit key function for routes with no authenticated
// user to key on (public endpoints mounted outside RequireAuth) — the
// leftmost address in X-Forwarded-For when present (Railway/most proxies
// set this), falling back to the raw connection address.
func ClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if ip := strings.TrimSpace(strings.Split(fwd, ",")[0]); ip != "" {
			return ip
		}
	}
	return r.RemoteAddr
}

// Middleware rejects requests over the limit with 429 Too Many Requests.
// keyFn extracts the rate-limit key from the request — for anything
// mounted behind RequireAuth, that's UserIDFromContext; a blank key (no
// authenticated user) is never rate-limited here since RequireAuth
// already rejects those requests before this ever runs.
func (rl *RateLimiter) Middleware(keyFn func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFn(r)
			if key != "" && !rl.Allow(key) {
				http.Error(w, `{"error":"too many requests — slow down and try again shortly"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
