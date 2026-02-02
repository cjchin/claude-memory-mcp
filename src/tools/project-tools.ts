/**
 * Project Tools - Project context management
 *
 * MCP tools for managing projects:
 * - set_project: Set the current project context
 * - list_projects: List all defined projects
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config, updateConfig } from "../config.js";
import { setProject, listProjects } from "../db.js";

/**
 * Register project tools with the MCP server
 */
export function registerProjectTools(server: McpServer): void {
  server.tool(
    "set_project",
    {
      name: z.string().describe("Project name"),
      description: z.string().optional(),
      tech_stack: z.array(z.string()).optional(),
    },
    async ({ name, description, tech_stack }) => {
      await setProject(name, description, tech_stack);
      updateConfig({ current_project: name });

      return {
        content: [
          {
            type: "text" as const,
            text: `Set current project to: ${name}`,
          },
        ],
      };
    }
  );

  server.tool("list_projects", {}, async () => {
    const projects = await listProjects();

    if (projects.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No projects defined." }],
      };
    }

    const formatted = projects
      .map(
        (p) =>
          `- ${p.name}${p.name === config.current_project ? " (current)" : ""}\n` +
          `  ${p.description || "No description"}\n` +
          `  Tech: ${p.tech_stack?.join(", ") || "Not specified"}\n` +
          `  Last active: ${p.last_active}`
      )
      .join("\n\n");

    return {
      content: [{ type: "text" as const, text: `Projects:\n\n${formatted}` }],
    };
  });
}
