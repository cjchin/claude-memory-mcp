/**
 * Session Tools - Session lifecycle management
 *
 * MCP tools for managing session state:
 * - start_session: Begin a new session
 * - end_session: End session with optional summary
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config, updateConfig } from "../config.js";
import {
  saveMemory,
  listMemories,
  startSession,
  endSession,
  getCurrentSessionId,
} from "../db.js";
import { generateSessionSummary } from "../intelligence.js";

/**
 * Register session tools with the MCP server
 */
export function registerSessionTools(server: McpServer): void {
  server.tool(
    "start_session",
    {
      project: z.string().optional().describe("Project for this session"),
    },
    async ({ project }) => {
      const sessionId = await startSession(project);

      if (project) {
        updateConfig({ current_project: project });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Started session ${sessionId}${project ? ` for project: ${project}` : ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "end_session",
    {
      summarize: z.boolean().optional().default(true).describe("Generate session summary"),
    },
    async ({ summarize }) => {
      const sessionId = getCurrentSessionId();

      let summaryText = "";
      if (summarize) {
        // Get memories from this session
        const memories = await listMemories({ limit: 100 });
        const sessionMemories = memories.filter((m) => m.session_id === sessionId);

        if (sessionMemories.length >= config.session_summary_min_memories) {
          summaryText = generateSessionSummary(sessionMemories);

          // Save summary as a memory
          await saveMemory({
            content: `Session summary (${sessionId}):\n${summaryText}`,
            type: "summary",
            tags: ["session-summary"],
            importance: 3,
            project: config.current_project,
            timestamp: new Date().toISOString(),
          });
        }
      }

      await endSession(summaryText);

      return {
        content: [
          {
            type: "text" as const,
            text: `Ended session ${sessionId}${summaryText ? `\n\nSummary:\n${summaryText}` : ""}`,
          },
        ],
      };
    }
  );
}
