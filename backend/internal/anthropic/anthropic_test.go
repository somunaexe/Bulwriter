package anthropic

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &Client{
		apiKey:  "test-key",
		model:   "test-model",
		baseURL: server.URL,
		http:    server.Client(),
	}
}

func TestEnabled(t *testing.T) {
	if (&Client{}).Enabled() {
		t.Fatal("expected a client with no API key to be disabled")
	}
	if !(&Client{apiKey: "x"}).Enabled() {
		t.Fatal("expected a client with an API key to be enabled")
	}
}

func TestGenerateStoryBible_Success(t *testing.T) {
	var gotReq messagesRequest

	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "test-key" {
			t.Errorf("expected x-api-key header to be sent, got %q", r.Header.Get("x-api-key"))
		}
		if r.Header.Get("anthropic-version") == "" {
			t.Error("expected anthropic-version header to be set")
		}
		if err := json.NewDecoder(r.Body).Decode(&gotReq); err != nil {
			t.Fatalf("decoding request body: %v", err)
		}

		draft := StoryBibleDraft{
			Genre:        "Psychological thriller",
			Tone:         "Bleak, darkly funny",
			Theme:        "Grief and denial",
			CoreQuestion: "Can you outrun your own guilt?",
			Logline:      "A grieving detective hunts the man he blames for his daughter's death.",
			Synopsis:     "Over one week, a detective's obsession with a cold case unravels his family.",
		}
		input, _ := json.Marshal(draft)

		resp := messagesResponse{
			Content: []contentBlock{{Type: "tool_use", Input: input}},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	draft, err := c.GenerateStoryBible("INT. HOUSE - DAY\nJohn stares at the photo.")
	if err != nil {
		t.Fatalf("GenerateStoryBible returned an error: %v", err)
	}

	if gotReq.Model != "test-model" {
		t.Errorf("expected model %q to be sent, got %q", "test-model", gotReq.Model)
	}
	if gotReq.ToolChoice.Name != toolName {
		t.Errorf("expected tool_choice to force %q, got %q", toolName, gotReq.ToolChoice.Name)
	}
	if len(gotReq.Messages) != 1 || !strings.Contains(gotReq.Messages[0].Content, "John stares at the photo") {
		t.Errorf("expected the document text to be sent as the user message, got %+v", gotReq.Messages)
	}

	if draft.Genre != "Psychological thriller" {
		t.Errorf("expected genre to round-trip, got %q", draft.Genre)
	}
	if draft.Synopsis == "" {
		t.Error("expected a non-empty synopsis")
	}
}

func TestGenerateStoryBible_Disabled(t *testing.T) {
	c := &Client{} // no API key
	if _, err := c.GenerateStoryBible("some text"); err == nil {
		t.Fatal("expected an error when no API key is configured")
	}
}

func TestGenerateStoryBible_EmptyText(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not have called the API for empty input")
	})
	if _, err := c.GenerateStoryBible("   \n\t  "); err == nil {
		t.Fatal("expected an error for whitespace-only text")
	}
}

func TestGenerateStoryBible_ApiError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(messagesResponse{
			Error: &apiError{Type: "authentication_error", Message: "invalid x-api-key"},
		})
	})
	_, err := c.GenerateStoryBible("some text")
	if err == nil {
		t.Fatal("expected an error when the API returns one")
	}
	if !strings.Contains(err.Error(), "invalid x-api-key") {
		t.Errorf("expected the API's error message to surface, got: %v", err)
	}
}

func TestGenerateStoryBible_TruncatesOverlongDocuments(t *testing.T) {
	var gotReq messagesRequest
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&gotReq)
		input, _ := json.Marshal(StoryBibleDraft{Genre: "g", Tone: "t", Theme: "th", CoreQuestion: "c", Logline: "l", Synopsis: "s"})
		json.NewEncoder(w).Encode(messagesResponse{Content: []contentBlock{{Type: "tool_use", Input: input}}})
	})

	huge := strings.Repeat("a", maxDocumentChars+1000)
	if _, err := c.GenerateStoryBible(huge); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(gotReq.Messages[0].Content) != maxDocumentChars {
		t.Errorf("expected the document to be truncated to %d chars, got %d", maxDocumentChars, len(gotReq.Messages[0].Content))
	}
}
