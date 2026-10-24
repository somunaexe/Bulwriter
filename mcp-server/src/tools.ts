import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./bulwriter.js";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

/** Registers every Bulwriter tool on a server instance. Shared by the local
 *  stdio entry point (index.ts) and the remote HTTP connector (server-http.ts)
 *  so both expose the exact same tool set. */
export function registerTools(server: McpServer): void {
  server.tool("list_projects", "List all Bulwriter projects you belong to.", {}, async () => {
    return json(await callApi("/projects"));
  });

  server.tool(
    "get_project",
    "Get one Bulwriter project's details by id.",
    { projectId: z.string().describe("The project's id, from list_projects.") },
    async ({ projectId }) => json(await callApi(`/projects/${projectId}`))
  );

  server.tool(
    "list_scripts",
    "List the scripts inside a Bulwriter project.",
    { projectId: z.string().describe("The project's id, from list_projects.") },
    async ({ projectId }) => json(await callApi(`/projects/${projectId}/scripts`))
  );

  server.tool(
    "get_story_bible",
    "Read a project's story bible: the core question, genre/tone/theme, idea notes, and each script's logline/synopsis.",
    { projectId: z.string().describe("The project's id, from list_projects.") },
    async ({ projectId }) => json(await callApi(`/projects/${projectId}/story`))
  );

  server.tool(
    "add_idea_note",
    "Add a new idea note to a project's story bible (appended to the end of the list).",
    {
      projectId: z.string().describe("The project's id, from list_projects."),
      text: z.string().describe("The note's text — a dream, a news story, a 'what if', etc."),
    },
    async ({ projectId, text }) =>
      json(await callApi(`/projects/${projectId}/story/notes`, { method: "POST", body: { text } }))
  );

  server.tool(
    "get_budget",
    "Read a script's budget: the per-unit rate estimate (shoot days/locations/cast/props) and freeform line items.",
    {
      projectId: z.string().describe("The project's id, from list_projects."),
      scriptId: z.string().describe("The script's id, from list_scripts."),
    },
    async ({ projectId, scriptId }) =>
      json(await callApi(`/projects/${projectId}/scripts/${scriptId}/budget`))
  );

  server.tool(
    "add_budget_line_item",
    "Add a freeform line item (label + amount) to a script's budget.",
    {
      projectId: z.string().describe("The project's id, from list_projects."),
      scriptId: z.string().describe("The script's id, from list_scripts."),
      label: z.string().describe("What the cost is for, e.g. 'Insurance'."),
      amount: z.number().describe("The cost in whole currency units, e.g. 500 for $500."),
    },
    async ({ projectId, scriptId, label, amount }) =>
      json(
        await callApi(`/projects/${projectId}/scripts/${scriptId}/budget/line-items`, {
          method: "POST",
          body: { label, amount },
        })
      )
  );
}
