// Package anthropic is a minimal client for Claude's Messages API — used
// to generate a story bible draft (genre/tone/theme/core question/
// logline/synopsis) from an uploaded document. Same hand-rolled net/http
// approach as internal/clerkapi rather than pulling in an SDK dependency
// for what's currently a single endpoint.
package anthropic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.anthropic.com/v1/messages"

type Client struct {
	apiKey  string
	model   string
	baseURL string // overridden by tests; always defaultBaseURL in production
	http    *http.Client
}

func NewClient() *Client {
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = "claude-sonnet-5"
	}
	return &Client{
		apiKey:  os.Getenv("ANTHROPIC_API_KEY"),
		model:   model,
		baseURL: defaultBaseURL,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Enabled reports whether an API key is configured — callers should
// return a clear "not set up" error rather than a confusing one when
// it's not, since ANTHROPIC_API_KEY is opt-in.
func (c *Client) Enabled() bool {
	return c.apiKey != ""
}

// StoryBibleDraft is what GenerateStoryBible extracts/infers from a
// document. It's always a draft for the writer to review and edit —
// nothing here gets saved on its own.
type StoryBibleDraft struct {
	Genre        string `json:"genre"`
	Tone         string `json:"tone"`
	Theme        string `json:"theme"`
	CoreQuestion string `json:"coreQuestion"`
	Logline      string `json:"logline"`
	Synopsis     string `json:"synopsis"`
}

// maxDocumentChars caps the request size — generous enough for a full
// feature script or a novel-length manuscript excerpt (~100k tokens of
// headroom), while keeping a single request's cost/latency bounded. A
// document longer than this is truncated rather than rejected outright.
const maxDocumentChars = 400_000

const systemPrompt = `You are helping a screenwriter build their story bible from a document they've written (a script, treatment, or manuscript). Read it and infer:
- genre: a short genre label (e.g. "Psychological thriller")
- tone: a short tonal description (e.g. "Bleak, darkly funny")
- theme: the central theme (e.g. "Grief and denial")
- coreQuestion: the core question or emotion the audience should leave with, one sentence
- logline: one to two sentences — who, what, what's at stake
- synopsis: a paragraph summarizing the full story arc

Write in the voice of a working screenwriter's own notes, not marketing copy. Base everything strictly on what's actually in the document — don't invent plot points it doesn't contain.`

const toolName = "story_bible_fields"

type messagesRequest struct {
	Model      string     `json:"model"`
	MaxTokens  int        `json:"max_tokens"`
	System     string     `json:"system"`
	Messages   []message  `json:"messages"`
	Tools      []tool     `json:"tools"`
	ToolChoice toolChoice `json:"tool_choice"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema inputSchema `json:"input_schema"`
}

type inputSchema struct {
	Type       string                `json:"type"`
	Properties map[string]schemaProp `json:"properties"`
	Required   []string              `json:"required"`
}

type schemaProp struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

type toolChoice struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type messagesResponse struct {
	Content []contentBlock `json:"content"`
	Error   *apiError      `json:"error"`
}

type contentBlock struct {
	Type  string          `json:"type"`
	Input json.RawMessage `json:"input"`
}

type apiError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// GenerateStoryBible sends the document's text to Claude and returns the
// inferred story bible fields, forced into a structured tool-call so the
// response is clean JSON rather than something that needs to be parsed
// out of free text.
func (c *Client) GenerateStoryBible(documentText string) (*StoryBibleDraft, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("story bible generation isn't configured (missing ANTHROPIC_API_KEY)")
	}

	text := strings.TrimSpace(documentText)
	if text == "" {
		return nil, fmt.Errorf("the document has no readable text")
	}
	if len(text) > maxDocumentChars {
		text = text[:maxDocumentChars]
	}

	reqBody := messagesRequest{
		Model:     c.model,
		MaxTokens: 1024,
		System:    systemPrompt,
		Messages:  []message{{Role: "user", Content: text}},
		Tools: []tool{{
			Name:        toolName,
			Description: "The story bible fields inferred from the document.",
			InputSchema: inputSchema{
				Type: "object",
				Properties: map[string]schemaProp{
					"genre":        {Type: "string", Description: `A short genre label, e.g. "Psychological thriller"`},
					"tone":         {Type: "string", Description: `A short tonal description, e.g. "Bleak, darkly funny"`},
					"theme":        {Type: "string", Description: `The central theme, e.g. "Grief and denial"`},
					"coreQuestion": {Type: "string", Description: "The core question or emotion the audience should leave with"},
					"logline":      {Type: "string", Description: "One to two sentences: who, what, what's at stake"},
					"synopsis":     {Type: "string", Description: "A paragraph summarizing the full story arc"},
				},
				Required: []string{"genre", "tone", "theme", "coreQuestion", "logline", "synopsis"},
			},
		}},
		ToolChoice: toolChoice{Type: "tool", Name: toolName},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("encoding request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.baseURL, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling Claude: %w", err)
	}
	defer resp.Body.Close()

	var body messagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("decoding Claude response: %w", err)
	}
	if body.Error != nil {
		return nil, fmt.Errorf("Claude API error: %s", body.Error.Message)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Claude API returned status %d", resp.StatusCode)
	}

	for _, block := range body.Content {
		if block.Type != "tool_use" {
			continue
		}
		var draft StoryBibleDraft
		if err := json.Unmarshal(block.Input, &draft); err != nil {
			return nil, fmt.Errorf("decoding story bible draft: %w", err)
		}
		return &draft, nil
	}

	return nil, fmt.Errorf("Claude didn't return a story bible draft")
}
