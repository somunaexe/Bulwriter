package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_AllowsUpToLimit(t *testing.T) {
	rl := NewRateLimiter(3, time.Minute)
	for i := 0; i < 3; i++ {
		if !rl.Allow("user1") {
			t.Fatalf("expected request %d to be allowed", i+1)
		}
	}
	if rl.Allow("user1") {
		t.Fatal("expected the 4th request within the window to be rejected")
	}
}

func TestRateLimiter_KeysAreIndependent(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	if !rl.Allow("user1") {
		t.Fatal("expected user1's first request to be allowed")
	}
	if rl.Allow("user1") {
		t.Fatal("expected user1's second request to be rejected")
	}
	if !rl.Allow("user2") {
		t.Fatal("expected user2's own budget to be untouched by user1's requests")
	}
}

func TestRateLimiter_WindowSlides(t *testing.T) {
	rl := NewRateLimiter(1, 30*time.Millisecond)
	if !rl.Allow("user1") {
		t.Fatal("expected the first request to be allowed")
	}
	if rl.Allow("user1") {
		t.Fatal("expected the second request within the window to be rejected")
	}
	time.Sleep(40 * time.Millisecond)
	if !rl.Allow("user1") {
		t.Fatal("expected a request after the window elapsed to be allowed again")
	}
}

func TestRateLimiter_Cleanup(t *testing.T) {
	rl := NewRateLimiter(1, 20*time.Millisecond)
	rl.Allow("user1")

	rl.mu.Lock()
	if _, ok := rl.requests["user1"]; !ok {
		rl.mu.Unlock()
		t.Fatal("expected user1 to have a recorded request before cleanup")
	}
	rl.mu.Unlock()

	time.Sleep(30 * time.Millisecond) // let the entry age out of the window

	done := make(chan struct{})
	go func() {
		rl.StartCleanup(10 * time.Millisecond)
		close(done)
	}()
	time.Sleep(25 * time.Millisecond) // give the cleanup ticker at least one tick

	rl.mu.Lock()
	_, stillPresent := rl.requests["user1"]
	rl.mu.Unlock()
	if stillPresent {
		t.Fatal("expected the stale user1 entry to be removed by cleanup")
	}
}

func TestRateLimiter_Middleware(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	called := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		w.WriteHeader(http.StatusOK)
	})

	handler := rl.Middleware(func(r *http.Request) string { return "user1" })(next)

	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec1.Code != http.StatusOK {
		t.Fatalf("expected the first request to succeed, got %d", rec1.Code)
	}

	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected the second request to be rate-limited with 429, got %d", rec2.Code)
	}

	if called != 1 {
		t.Fatalf("expected the wrapped handler to run exactly once, ran %d times", called)
	}
}

func TestRateLimiter_MiddlewareSkipsBlankKey(t *testing.T) {
	rl := NewRateLimiter(1, time.Minute)
	rl.Allow("") // if a blank key were ever tracked, this would exhaust its budget

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := rl.Middleware(func(r *http.Request) string { return "" })(next)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected a blank key (no authenticated user) to never be rate-limited here, got %d", rec.Code)
	}
}
