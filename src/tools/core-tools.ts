/**
 * Core Memory Tools
 *
 * Fundamental CRUD operations for the memory system:
 * - remember: Save a new memory with auto-detection
 * - recall: Semantic search across memories
 * - get_memory: Retrieve a single memory by ID
 * - update_memory: Modify existing memory
 * - forget: Delete a memory
 * - list_memories: Browse memories with filters
 * - memory_stats: View memory statistics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  saveMemory,
  searchMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  listMemories,
  getMemoryStats,
  getCurrentSessionId,
  addMemoryToSession,
} from "../db.js";
import { config } from "../config.js";
import { detectMemoryType, detectTags, estimateImportance } from "../intelligence.js";
import { cleanText, extractEntities, extractReasoning } from "../preprocess.js";
import type { MemoryType } from "../types.js";
import { recordToolActivity } from "./shadow-tools.js";
import { checkDuplicates } from "../dedupe.js";

export function registerCoreTools(server: McpServer): void {
  // Save a memory with auto-detection
  server.tool(
    "remember",
    {
      content: z.string().describe("The insight, decision, pattern, or context to remember"),
      type: z
        .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference"])
        .optional()
        .describe("Memory type (auto-detected if not specified)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization (auto-detected if not specified)"),
      importance: z.number().min(1).max(5).optional().describe("Importance 1-5 (auto-detected if not specified)"),
      project: z.string().optional().describe("Project name (uses current project if not specified)"),
    },
    async ({ content, type, tags, importance, project }) => {
      // Preprocess the content
      const cleanedContent = cleanText(content);
      const extractedEntities = extractEntities(content);
      const extractedReasoning = extractReasoning(content);

      // Check for duplicates first (using STRICT threshold for explicit remember)
      const similar = await checkDuplicates(cleanedContent, "STRICT");
      if (similar.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Warning: Very similar memory already exists:\n"${similar[0].content.slice(0, 100)}..."\n\nMemory not saved. Use update_memory to modify existing, or rephrase to save as new.`,
            },
          ],
        };
      }

      // Auto-detect if not specified
      const detectedType = type || detectMemoryType(content);
      const detectedTags = tags?.length ? tags : detectTags(content);
      const detectedImportance = importance ?? estimateImportance(content);

      // Merge extracted entities into tags
      const mergedTags = [...new Set([...detectedTags, ...extractedEntities])];

      const id = await saveMemory({
        content: cleanedContent,
        type: detectedType,
        tags: mergedTags,
        importance: detectedImportance,
        project: project || config.current_project,
        session_id: getCurrentSessionId(),
        timestamp: new Date().toISOString(),
        valid_from: new Date().toISOString(),
        source: "human",
        // Store extracted reasoning in metadata
        metadata: extractedReasoning ? { reasoning: extractedReasoning } : undefined,
      });

      await addMemoryToSession(id);

      // Record shadow activity
      recordToolActivity("memory_access", `remember: ${detectedType} - ${cleanedContent.slice(0, 50)}...`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Saved memory [${id}]\nType: ${detectedType}\nTags: ${mergedTags.join(", ") || "none"}\nImportance: ${detectedImportance}/5${extractedEntities.length ? `\nExtracted entities: ${extractedEntities.join(", ")}` : ""}`,
          },
        ],
      };
    }
  );

  // Semantic search
  server.tool(
    "recall",
    {
      query: z.string().describe("What to search for (semantic search)"),
      limit: z.number().optional().default(5).describe("Max results"),
      types: z
        .array(z.enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference", "shadow"]))
        .optional()
        .describe("Filter by memory types"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      project: z.string().optional().describe("Filter by project"),
      min_importance: z.number().min(1).max(5).optional().describe("Minimum importance level"),
    },
    async ({ query, limit, types, tags, project, min_importance }) => {
      recordToolActivity("search", `recall: ${query}`);

      const memories = await searchMemories(query, {
        limit,
        types: types as MemoryType[] | undefined,
        tags,
        project: project || config.current_project,
        minImportance: min_importance,
      });

      if (memories.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No relevant memories found." }],
        };
      }

      const formatted = memories
        .map(
          (m, i) =>
            `[${i + 1}] ${m.type.toUpperCase()} (${Math.round(m.score * 100)}% match, importance: ${m.importance}/5)\n` +
            `ID: ${m.id}\n` +
            `Tags: ${m.tags.join(", ") || "none"}\n` +
            `Project: ${m.project || "unassigned"}\n` +
            `Date: ${m.timestamp}\n` +
            `${m.content}`
        )
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${memories.length} relevant memories:\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Get full memory by ID
  server.tool(
    "get_memory",
    {
      id: z.string().describe("Memory ID"),
    },
    async ({ id }) => {
      const memory = await getMemory(id);

      if (!memory) {
        return {
          content: [{ type: "text" as const, text: `Memory ${id} not found.` }],
        };
      }

      recordToolActivity("memory_access", `get_memory: ${memory.type} - ${memory.content.slice(0, 50)}...`);

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Memory: ${memory.id}\n` +
              `Type: ${memory.type}\n` +
              `Tags: ${memory.tags.join(", ")}\n` +
              `Importance: ${memory.importance}/5\n` +
              `Project: ${memory.project || "unassigned"}\n` +
              `Created: ${memory.timestamp}\n` +
              `Accessed: ${memory.access_count} times\n` +
              `Last accessed: ${memory.last_accessed || "never"}\n\n` +
              `Content:\n${memory.content}`,
          },
        ],
      };
    }
  );

  // Update memory
  server.tool(
    "update_memory",
    {
      id: z.string().describe("Memory ID to update"),
      content: z.string().optional().describe("New content"),
      type: z
        .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference", "shadow"])
        .optional(),
      tags: z.array(z.string()).optional(),
      importance: z.number().min(1).max(5).optional(),
    },
    async ({ id, content, type, tags, importance }) => {
      await updateMemory(id, { content, type, tags, importance });
      return {
        content: [{ type: "text" as const, text: `Updated memory ${id}` }],
      };
    }
  );

  // Delete memory
  server.tool(
    "forget",
    {
      id: z.string().describe("Memory ID to delete"),
    },
    async ({ id }) => {
      await deleteMemory(id);
      return {
        content: [{ type: "text" as const, text: `Deleted memory ${id}` }],
      };
    }
  );

  // List memories
  server.tool(
    "list_memories",
    {
      limit: z.number().optional().default(20),
      project: z.string().optional(),
      type: z
        .enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference", "shadow"])
        .optional(),
      sort_by: z.enum(["recent", "importance", "accessed"]).optional().default("recent"),
    },
    async ({ limit, project, type, sort_by }) => {
      const memories = await listMemories({
        limit,
        project: project || config.current_project,
        type: type as MemoryType | undefined,
        sortBy: sort_by,
      });

      if (memories.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No memories found." }],
        };
      }

      const formatted = memories
        .map(
          (m) =>
            `- [${m.id}] ${m.type} (imp: ${m.importance}) ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Memories (${memories.length}):\n\n${formatted}`,
          },
        ],
      };
    }
  );

  // Memory statistics
  server.tool("memory_stats", {}, async () => {
    const stats = await getMemoryStats();

    const typeBreakdown = Object.entries(stats.byType)
      .map(([type, count]) => `  ${type}: ${count}`)
      .join("\n");

    const projectBreakdown = Object.entries(stats.byProject)
      .map(([project, count]) => `  ${project || "unassigned"}: ${count}`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Memory Statistics\n` +
            `=================\n\n` +
            `Total memories: ${stats.total}\n` +
            `Added this week: ${stats.recentCount}\n\n` +
            `By type:\n${typeBreakdown}\n\n` +
            `By project:\n${projectBreakdown}`,
        },
      ],
    };
  });
}
