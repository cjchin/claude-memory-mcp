/**
 * Utility Tools - General-purpose memory utilities
 *
 * MCP tools for memory utilities:
 * - merge_memories: Consolidate multiple memories
 * - find_similar: Find similar memories by content
 * - memory_types: List available memory types
 * - soul_status: Quick health check
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import {
  consolidateMemories,
  findSimilarMemories,
  getMemoryStats,
  getCurrentSessionId,
} from "../db.js";
import { MEMORY_TYPE_DESCRIPTIONS } from "../types.js";
import { DEDUPE_THRESHOLDS } from "../dedupe.js";

/**
 * Register utility tools with the MCP server
 */
export function registerUtilityTools(server: McpServer): void {
  server.tool(
    "merge_memories",
    {
      ids: z.array(z.string()).min(2).describe("Memory IDs to merge"),
      merged_content: z.string().describe("The consolidated content"),
      keep_metadata_from: z.string().describe("ID of memory whose metadata to keep"),
    },
    async ({ ids, merged_content, keep_metadata_from }) => {
      const newId = await consolidateMemories(ids, merged_content, keep_metadata_from);
      return {
        content: [
          {
            type: "text" as const,
            text: `Merged ${ids.length} memories into ${newId}`,
          },
        ],
      };
    }
  );

  server.tool(
    "find_similar",
    {
      content: z.string().describe("Content to find similar memories for"),
      threshold: z.number().min(0).max(1).optional().default(DEDUPE_THRESHOLDS.LOOSE)
        .describe("Similarity threshold (default: 0.7 LOOSE)"),
    },
    async ({ content, threshold }) => {
      const similar = await findSimilarMemories(content, threshold);

      if (similar.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No similar memories found." }],
        };
      }

      const formatted = similar
        .map((m: any) => `- [${m.id}] (${Math.round(m.score * 100)}% similar) ${m.content.slice(0, 100)}...`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Similar memories:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Memory type help
  server.tool("memory_types", {}, async () => {
    const types = Object.entries(MEMORY_TYPE_DESCRIPTIONS)
      .map(([type, desc]) => `- ${type}: ${desc}`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Available memory types:\n\n${types}`,
        },
      ],
    };
  });

  // Health check / status
  server.tool("soul_status", {}, async () => {
    const stats = await getMemoryStats();
    const sessionId = getCurrentSessionId();

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Digital Soul Status: ONLINE\n` +
            `========================\n\n` +
            `Session: ${sessionId}\n` +
            `Current Project: ${config.current_project || "none"}\n` +
            `Total Memories: ${stats.total}\n` +
            `This Week: ${stats.recentCount}\n` +
            `Memory Decay: ${config.enable_memory_decay ? "enabled" : "disabled"}\n` +
            `ChromaDB: ${config.chroma_host}:${config.chroma_port}\n\n` +
            `Soul is ready.`,
        },
      ],
    };
  });
}
