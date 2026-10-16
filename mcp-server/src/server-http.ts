import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { registerTools } from "./tools.js";
import { BulwriterOAuthProvider } from "./oauth-provider.js";

// Remote entry point: a claude.ai custom connector. Exposes the same tools
// as index.ts (stdio), but over HTTP, gated by an OAuth 2.1 + PKCE login
// flow instead of relying on the process environment alone — anyone who
// finds this server's URL still has to pass the MCP_OAUTH_PASSWORD login
// screen before they can touch your Bulwriter account.

const PORT = Number(process.env["PORT"] ?? 3000);
const PUBLIC_URL = process.env["PUBLIC_URL"];
const OAUTH_PASSWORD = process.env["MCP_OAUTH_PASSWORD"];

if (!PUBLIC_URL) {
  throw new Error(
    "Missing PUBLIC_URL — set it to this server's own public HTTPS URL (e.g. the Railway-assigned domain), " +
      "so OAuth redirects and metadata resolve correctly. See mcp-server/README.md."
  );
}
if (!OAUTH_PASSWORD) {
  throw new Error("Missing MCP_OAUTH_PASSWORD — set it to the password claude.ai's connector login screen will ask for.");
}

const issuerUrl = new URL(PUBLIC_URL);
const mcpUrl = new URL("/mcp", PUBLIC_URL);
const provider = new BulwriterOAuthProvider(OAUTH_PASSWORD);

const app = express();

// Dynamic client registration, /authorize (login screen), /token, and the
// OAuth + protected-resource metadata documents claude.ai discovers on
// first connecting — all provided by the MCP SDK, driven by `provider`.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl,
    resourceServerUrl: mcpUrl,
    resourceName: "Bulwriter",
  })
);

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl);

app.post(
  "/mcp",
  requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
  express.json(),
  async (req, res) => {
    // Stateless: each call gets its own throwaway server+transport pair —
    // there's no per-connection state to maintain, every tool call just
    // proxies straight through to Bulwriter's own API.
    const server = new McpServer({ name: "bulwriter-mcp", version: "0.1.0" });
    registerTools(server);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
);

// Stateless mode keeps no session to resume (GET) or tear down (DELETE).
app.get("/mcp", (_req, res) => res.status(405).json({ error: "This server is stateless; only POST /mcp is supported." }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "This server is stateless; only POST /mcp is supported." }));

app.listen(PORT, () => {
  console.log(`bulwriter-mcp listening on :${PORT}, public URL ${PUBLIC_URL}`);
});
