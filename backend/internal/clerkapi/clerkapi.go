// clerkapi — resolves Clerk user IDs to display profiles (name, email,
// avatar) via Clerk's Backend API. The frontend Clerk SDK only exposes the
// signed-in user's own profile, not other members' — collaborator info has
// to come from here, using a server-side secret key.
package clerkapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Profile struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	ImageURL string `json:"imageUrl"`
}

type Client struct {
	secretKey string
	http      *http.Client

	mu    sync.RWMutex
	cache map[string]cacheEntry
}

type cacheEntry struct {
	profile *Profile
	expires time.Time
}

const cacheTTL = 5 * time.Minute

func NewClient() *Client {
	return &Client{
		secretKey: os.Getenv("CLERK_SECRET_KEY"),
		http:      &http.Client{Timeout: 5 * time.Second},
		cache:     make(map[string]cacheEntry),
	}
}

// Enabled reports whether a secret key is configured — callers should
// degrade gracefully (skip enrichment) rather than error when it's not,
// since CLERK_SECRET_KEY is an opt-in addition to the existing
// CLERK_FRONTEND_API-only setup.
func (c *Client) Enabled() bool {
	return c.secretKey != ""
}

// GetProfile fetches (and briefly caches) a single user's public profile.
// Returns nil, nil for a user Clerk doesn't recognize (e.g. deleted
// account) rather than erroring the whole members list over one bad row.
func (c *Client) GetProfile(userID string) (*Profile, error) {
	if !c.Enabled() || userID == "" {
		return nil, nil
	}

	c.mu.RLock()
	if entry, ok := c.cache[userID]; ok && time.Now().Before(entry.expires) {
		c.mu.RUnlock()
		return entry.profile, nil
	}
	c.mu.RUnlock()

	req, err := http.NewRequest(http.MethodGet, "https://api.clerk.com/v1/users/"+userID, nil)
	if err != nil {
		return nil, fmt.Errorf("building clerk request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling clerk: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		c.store(userID, nil)
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("clerk returned status %d for user %s", resp.StatusCode, userID)
	}

	var body struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		ImageURL  string `json:"image_url"`
		EmailAddresses []struct {
			ID    string `json:"id"`
			Email string `json:"email_address"`
		} `json:"email_addresses"`
		PrimaryEmailAddressID string `json:"primary_email_address_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decoding clerk response: %w", err)
	}

	email := ""
	for _, e := range body.EmailAddresses {
		if e.ID == body.PrimaryEmailAddressID {
			email = e.Email
			break
		}
	}
	if email == "" && len(body.EmailAddresses) > 0 {
		email = body.EmailAddresses[0].Email
	}

	name := (body.FirstName + " " + body.LastName)
	if body.FirstName == "" && body.LastName == "" {
		name = email
	}

	profile := &Profile{Name: strings.TrimSpace(name), Email: email, ImageURL: body.ImageURL}
	c.store(userID, profile)
	return profile, nil
}

func (c *Client) store(userID string, profile *Profile) {
	c.mu.Lock()
	c.cache[userID] = cacheEntry{profile: profile, expires: time.Now().Add(cacheTTL)}
	c.mu.Unlock()
}
