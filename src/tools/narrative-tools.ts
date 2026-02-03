/**
 * Narrative Intelligence MCP Tools - v3.0 Phase 2
 *
 * MCP tools for querying and analyzing narrative structure in memories.
 * Enables story arc detection, causal chain tracing, and narrative role classification.
 *
 * Tools provided:
 * 1. recall_narrative - Semantic search with narrative role filtering
 * 2. story_arcs - Detect and display story arcs
 * 3. causal_chain - Trace causal sequences from a memory
 * 4. narrative_timeline - Show narrative progression over time
 * 5. find_resolution - Find resolution for a problem memory
 * 6. infer_narrative_role - Manual narrative role inference
 * 7. narrative_stats - Aggregate narrative statistics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listMemories, searchMemories, getMemory } from "../db.js";
import {
  inferNarrativeRole,
  detectCausalRelationship,
  buildCausalChain,
  detectStoryArcs,
  extractThemes,
  findResolution,
  analyzeNarrativeStructure,
  DEFAULT_NARRATIVE_CONFIG
} from "../narrative-intelligence.js";
import type { Memory, NarrativeRole } from "../types.js";
import { config } from "../config.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format narrative role with emoji
 */
function formatNarrativeRole(role: NarrativeRole | undefined): string {
  if (!role) return "?";

  const roleEmojis: Record<NarrativeRole, string> = {
    exposition: "📖",
    rising_action: "📈",
    climax: "⚡",
    falling_action: "📉",
    resolution: "✅"
  };

  return `${roleEmojis[role]} ${role}`;
}

/**
 * Format memory for narrative display
 */
function formatNarrativeMemory(memory: Memory, index?: number): string {
  const prefix = index !== undefined ? `[${index + 1}] ` : "";
  const nc = memory.narrative_context;

  let output = `${prefix}${formatNarrativeRole(nc?.narrative_role)} `;
  output += `(ID: ${memory.id}, type: ${memory.type})`;

  if (nc?.turning_point) {
    output += " 🔄 TURNING POINT";
  }

  output += `\n  Tags: ${memory.tags.join(", ") || "none"}`;
  output += `\n  Date: ${memory.timestamp}`;

  if (nc?.story_arc_id) {
    output += `\n  Arc: ${nc.story_arc_id}`;
  }

  if (nc?.themes?.length) {
    output += `\n  Themes: ${nc.themes.join(", ")}`;
  }

  output += `\n  ${memory.content.slice(0, 200)}${memory.content.length > 200 ? "..." : ""}`;

  return output;
}

// ============================================================================
// MCP Tool Registration
// ============================================================================

export function registerNarrativeTools(server: McpServer): void {
  /**
   * Tool 1: recall_narrative
   *
   * Semantic search with narrative role filtering
   */
  server.tool(
    "recall_narrative",
    {
      query: z.string().describe("Semantic search query"),
      narrative_role: z
        .enum(["exposition", "rising_action", "climax", "falling_action", "resolution"])
        .optional()
        .describe("Filter by narrative role"),
      has_turning_point: z.boolean().optional().describe("Filter for turning points only"),
      story_arc_id: z.string().optional().describe("Filter by story arc ID"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum results"),
      project: z.string().optional().describe("Filter by project")
    },
    async ({ query, narrative_role, has_turning_point, story_arc_id, limit, project }) => {
      // Perform semantic search
      const searchResults = await searchMemories(query, {
        limit: limit * 2, // Get more to filter
        project: project || config.current_project
      });

      // Filter by narrative criteria
      let filtered: Memory[] = searchResults as Memory[];

      // Filter by narrative role
      if (narrative_role) {
        filtered = filtered.filter(
          (m: Memory) => m.narrative_context?.narrative_role === narrative_role
        );
      }

      // Filter by turning point
      if (has_turning_point) {
        filtered = filtered.filter((m: Memory) => m.narrative_context?.turning_point === true);
      }

      // Filter by story arc
      if (story_arc_id) {
        filtered = filtered.filter(
          (m: Memory) => m.narrative_context?.story_arc_id === story_arc_id
        );
      }

      // Limit results
      const results = filtered.slice(0, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found matching narrative criteria."
            }
          ]
        };
      }

      // Format output
      const formatted = results.map((m: Memory, i: number) => formatNarrativeMemory(m, i)).join("\n\n");

      let summary = `Found ${results.length} memories`;
      if (narrative_role) summary += ` in ${narrative_role} stage`;
      if (has_turning_point) summary += ` (turning points only)`;
      summary += ":\n\n";

      return {
        content: [
          {
            type: "text" as const,
            text: summary + formatted
          }
        ]
      };
    }
  );

  /**
   * Tool 2: story_arcs
   *
   * Detect and display story arcs across memories
   */
  server.tool(
    "story_arcs",
    {
      project: z.string().optional().describe("Filter by project"),
      theme: z.string().optional().describe("Filter by theme (tag)"),
      min_arc_length: z
        .number()
        .min(2)
        .max(20)
        .optional()
        .default(3)
        .describe("Minimum memories per arc"),
      days: z
        .number()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Look back this many days"),
      limit: z.number().min(1).max(20).optional().default(5).describe("Maximum arcs to show")
    },
    async ({ project, theme, min_arc_length, days, limit }) => {
      // Get recent memories
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const memories = await listMemories({
        limit: 100, // Analyze up to 100 recent memories
        project: project || config.current_project,
        sortBy: "recent"
      });

      // Filter by date
      const recentMemories = memories.filter((m: Memory) => {
        const memDate = new Date(m.timestamp);
        return memDate >= cutoffDate;
      });

      // Filter by theme if specified
      const filteredMemories = theme
        ? recentMemories.filter((m: Memory) => m.tags.includes(theme))
        : recentMemories;

      if (filteredMemories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found in specified time range."
            }
          ]
        };
      }

      // Detect story arcs
      const arcs = detectStoryArcs(filteredMemories, {
        ...DEFAULT_NARRATIVE_CONFIG,
        min_arc_length
      });

      if (arcs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No story arcs detected (min length: ${min_arc_length}). Try lowering min_arc_length or expanding time range.`
            }
          ]
        };
      }

      // Format output
      const arcsSummary = arcs.slice(0, limit).map((arc, i) => {
        const duration = new Date(arc.endTime).getTime() - new Date(arc.startTime).getTime();
        const durationHours = Math.round(duration / (1000 * 60 * 60));

        let output = `\n📚 STORY ARC ${i + 1}: "${arc.theme}"\n`;
        output += `   Arc ID: ${arc.arc_id}\n`;
        output += `   Duration: ${durationHours}h (${arc.startTime.split("T")[0]} → ${arc.endTime.split("T")[0]})\n`;
        output += `   Memories: ${arc.memories.length}\n\n`;

        arc.memories.forEach((mem: Memory, j: number) => {
          const nc = mem.narrative_context;
          const role = nc?.narrative_role || "unknown";
          const turningPoint = nc?.turning_point ? " 🔄" : "";
          output += `   ${j + 1}. ${formatNarrativeRole(role as NarrativeRole)}${turningPoint}: ${mem.content.slice(0, 80)}...\n`;
        });

        return output;
      });

      const header = `Detected ${arcs.length} story arc${arcs.length > 1 ? "s" : ""} in last ${days} days:\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: header + arcsSummary.join("\n")
          }
        ]
      };
    }
  );

  /**
   * Tool 3: causal_chain
   *
   * Trace causal sequence from a starting memory
   */
  server.tool(
    "causal_chain",
    {
      memory_id: z.string().describe("Starting memory ID"),
      max_length: z
        .number()
        .min(2)
        .max(20)
        .optional()
        .default(10)
        .describe("Maximum chain length"),
      min_confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.6)
        .describe("Minimum causal confidence")
    },
    async ({ memory_id, max_length, min_confidence }) => {
      const startMemory = await getMemory(memory_id);

      if (!startMemory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      // Get recent memories to search
      const allMemories = await listMemories({
        limit: 100,
        project: startMemory.project,
        sortBy: "recent"
      });

      // Build causal chain
      const chain = buildCausalChain(startMemory, allMemories, {
        ...DEFAULT_NARRATIVE_CONFIG,
        causal_confidence_threshold: min_confidence
      });

      if (chain.length === 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No causal chain found from memory ${memory_id}. Try lowering min_confidence.`
            }
          ]
        };
      }

      // Format output
      let output = `🔗 CAUSAL CHAIN (${chain.length} memories)\n\n`;
      output += `Starting from: ${startMemory.content.slice(0, 100)}...\n\n`;

      chain.slice(0, max_length).forEach((link, i) => {
        const mem = link.memory;
        const nc = mem.narrative_context;
        const confidence = i > 0 ? ` (confidence: ${(link.causalConfidence * 100).toFixed(0)}%)` : "";

        output += `${i + 1}. ${formatNarrativeRole(nc?.narrative_role as NarrativeRole)}${confidence}\n`;
        output += `   ${mem.content.slice(0, 150)}${mem.content.length > 150 ? "..." : ""}\n`;

        if (i < chain.length - 1) {
          output += `   ↓\n`;
        }

        output += `\n`;
      });

      if (chain.length > max_length) {
        output += `... and ${chain.length - max_length} more\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 4: narrative_timeline
   *
   * Show narrative progression over time
   */
  server.tool(
    "narrative_timeline",
    {
      project: z.string().optional().describe("Filter by project"),
      theme: z.string().optional().describe("Filter by theme (tag)"),
      days: z
        .number()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Look back this many days")
    },
    async ({ project, theme, days }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const memories = await listMemories({
        limit: 100,
        project: project || config.current_project,
        sortBy: "recent"
      });

      // Filter by date and theme
      let filtered = memories.filter((m: Memory) => {
        const memDate = new Date(m.timestamp);
        return memDate >= cutoffDate;
      });

      if (theme) {
        filtered = filtered.filter((m: Memory) => m.tags.includes(theme));
      }

      if (filtered.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found in specified time range."
            }
          ]
        };
      }

      // Ensure narrative context for all memories
      const enriched = filtered.map((m: Memory) => {
        if (!m.narrative_context) {
          m.narrative_context = inferNarrativeRole(m);
        }
        return m;
      });

      // Sort by timestamp
      enriched.sort(
        (a: Memory, b: Memory) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Build timeline
      let output = `📅 NARRATIVE TIMELINE (${enriched.length} memories in last ${days} days)\n\n`;

      if (theme) {
        output += `Theme: ${theme}\n\n`;
      }

      enriched.forEach((mem: Memory, i: number) => {
        const nc = mem.narrative_context!;
        const date = new Date(mem.timestamp).toISOString().split("T")[0];
        const time = new Date(mem.timestamp).toISOString().split("T")[1].slice(0, 5);

        output += `${date} ${time} │ ${formatNarrativeRole(nc.narrative_role as NarrativeRole)}`;

        if (nc.turning_point) {
          output += " 🔄 TURNING POINT";
        }

        output += `\n             │ ${mem.content.slice(0, 100)}${mem.content.length > 100 ? "..." : ""}\n`;

        if (i < enriched.length - 1) {
          output += `             ↓\n`;
        }
      });

      // Statistics
      const roleCount: Record<string, number> = {};
      enriched.forEach((m: Memory) => {
        const role = m.narrative_context?.narrative_role || "unknown";
        roleCount[role] = (roleCount[role] || 0) + 1;
      });

      output += `\n📊 Role Distribution:\n`;
      Object.entries(roleCount).forEach(([role, count]) => {
        output += `   ${formatNarrativeRole(role as NarrativeRole)}: ${count}\n`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 5: find_resolution
   *
   * Find resolution for a problem memory
   */
  server.tool(
    "find_resolution",
    {
      memory_id: z.string().describe("Problem/question memory ID"),
      max_days_forward: z
        .number()
        .min(1)
        .max(90)
        .optional()
        .default(30)
        .describe("Search forward this many days")
    },
    async ({ memory_id, max_days_forward }) => {
      const problemMemory = await getMemory(memory_id);

      if (!problemMemory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      // Get memories to search
      const allMemories = await listMemories({
        limit: 100,
        project: problemMemory.project,
        sortBy: "recent"
      });

      // Find resolution
      const result = findResolution(problemMemory, allMemories, max_days_forward);

      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No resolution found for memory ${memory_id} within ${max_days_forward} days.`
            }
          ]
        };
      }

      const { memory: resolution, confidence } = result;

      let output = `✅ RESOLUTION FOUND (confidence: ${(confidence * 100).toFixed(0)}%)\n\n`;
      output += `Problem:\n${formatNarrativeMemory(problemMemory)}\n\n`;
      output += `Resolution:\n${formatNarrativeMemory(resolution)}\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 6: infer_narrative_role
   *
   * Manual narrative role inference for testing
   */
  server.tool(
    "infer_narrative_role",
    {
      text: z.string().describe("Text to analyze for narrative role"),
      memory_type: z
        .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference"])
        .optional()
        .describe("Memory type (affects inference)"),
      explicit_role: z
        .enum(["exposition", "rising_action", "climax", "falling_action", "resolution"])
        .optional()
        .describe("Override with explicit role")
    },
    async ({ text, memory_type, explicit_role }) => {
      // Create temporary memory for inference
      const tempMemory: Memory = {
        id: "temp",
        content: text,
        type: memory_type || "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0
      };

      const result = inferNarrativeRole(tempMemory, explicit_role);

      let output = `🎭 NARRATIVE ROLE INFERENCE\n\n`;
      output += `Text: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}\n\n`;
      output += `Detected Role: ${formatNarrativeRole(result.narrative_role!)}\n`;
      output += `Confidence: ${((result.narrative_confidence || 0) * 100).toFixed(0)}%\n`;
      output += `Detection Method: ${result.detected_by}\n`;

      if (result.turning_point) {
        output += `\n🔄 TURNING POINT detected\n`;
      }

      // Role explanation
      const roleDescriptions: Record<NarrativeRole, string> = {
        exposition: "Background, context, or setup phase",
        rising_action: "Complications and challenges building",
        climax: "Peak tension, critical decision or breakthrough",
        falling_action: "Consequences unfolding",
        resolution: "Outcome, closure, lessons learned"
      };

      if (result.narrative_role) {
        output += `\nMeaning: ${roleDescriptions[result.narrative_role]}\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 7: narrative_stats
   *
   * Aggregate narrative statistics
   */
  server.tool(
    "narrative_stats",
    {
      project: z.string().optional().describe("Filter by project"),
      days: z
        .number()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Analyze last N days")
    },
    async ({ project, days }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const memories = await listMemories({
        limit: 200,
        project: project || config.current_project,
        sortBy: "recent"
      });

      // Filter by date
      const recentMemories = memories.filter((m: Memory) => {
        const memDate = new Date(m.timestamp);
        return memDate >= cutoffDate;
      });

      if (recentMemories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found in specified time range."
            }
          ]
        };
      }

      // Analyze structure
      const analysis = analyzeNarrativeStructure(recentMemories);

      let output = `📊 NARRATIVE STATISTICS (last ${days} days)\n\n`;
      output += `Total Memories: ${analysis.total_memories}\n`;
      output += `With Narrative Context: ${analysis.with_narrative_context} (${((analysis.with_narrative_context / analysis.total_memories) * 100).toFixed(0)}%)\n\n`;

      output += `📖 Role Distribution:\n`;
      const sortedRoles = Object.entries(analysis.role_distribution).sort(
        (a, b) => b[1] - a[1]
      );
      sortedRoles.forEach(([role, count]) => {
        if (count > 0) {
          output += `   ${formatNarrativeRole(role as NarrativeRole)}: ${count}\n`;
        }
      });

      output += `\n🔄 Turning Points: ${analysis.turning_points}\n`;
      output += `📚 Story Arcs: ${analysis.story_arcs}\n`;
      output += `📏 Average Arc Length: ${analysis.avg_arc_length} memories\n\n`;

      if (analysis.themes.length > 0) {
        output += `🎯 Top Themes:\n`;
        analysis.themes.slice(0, 10).forEach((theme) => {
          output += `   ${theme.theme}: ${theme.count} memories\n`;
        });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );
}
