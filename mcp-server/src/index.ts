#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

// Local entry point: run as a subprocess over stdio, for `claude mcp add`.
// For the remote claude.ai connector (HTTP + OAuth), see server-http.ts.

const server = new McpServer({
  name: "bulwriter-mcp",
  version: "0.1.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
