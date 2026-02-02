/**
 * Shadow Log Tools - Ephemeral Working Memory
 *
 * MCP tools for managing shadow log state:
 * - shadow_status: View active shadows across sessions
 * - promote_shadow: Convert shadows to long-term memory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { saveMemory, getCurrentSessionId } from "../db.js";
import {
  recordActivity,
  listActiveShadows,
  getSessionShadows,
  getShadowById,
  checkPromotionThresholds,
  markShadowPromoted,
  getRecentlyPromoted,
  generateShadowSummary,
  getShadowStats,
  createActivity,
  getActiveMinutes,
} from "../shadow-log.js";

/**
 * Helper to record shadow activity from tool usage
 * Exported so other tools can use it
 */
export function recordToolActivity(
  activityType: "memory_access" | "search" | "tool_use",
  detail: string,
  tokens?: number
): void {
  if (!config.shadow_enabled) return;

  try {
    const sessionId = getCurrentSessionId();
    const activity = createActivity(activityType, detail, tokens);
    recordActivity(sessionId, activity);
  } catch (error) {
    // Silently ignore shadow log errors to not disrupt main functionality
    console.error("Shadow log error:", error);
  }
}

/**
 * Count activities by type, accounting for deduplication
 */
function countActivityTypes(activities: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const activity of activities) {
    const type = activity.type;
    const count = activity.metadata?.count || 1;
    counts[type] = (counts[type] || 0) + count;
  }
  return counts;
}

/**
 * Extract key details from activities (filenames, queries, commands)
 */
function extractKeyDetails(
  activities: any[],
  limit: number = 5
): { files: string[]; searches: string[]; commands: string[] } {
  const files: string[] = [];
  const searches: string[] = [];
  const commands: string[] = [];

  for (const activity of activities) {
    if (activity.type === "file_read" || activity.type === "file_write") {
      const filename = activity.detail.split(/[/\\]/).pop() || activity.detail;
      if (files.length < limit) files.push(filename);
    } else if (activity.type === "search") {
      if (searches.length < limit) searches.push(`"${activity.detail}"`);
    } else if (activity.type === "command") {
      const shortCmd = activity.detail.length > 40
        ? activity.detail.slice(0, 40) + "..."
        : activity.detail;
      if (commands.length < limit) commands.push(shortCmd);
    }
  }

  return { files, searches, commands };
}

/**
 * Register shadow log tools with the MCP server
 */
export function registerShadowTools(server: McpServer): void {
  /**
   * LOG_ACTIVITY - Record a single activity in the shadow log
   * Used by Claude to self-report built-in tool usage (Read, Write, Grep, Bash)
   */
  server.tool(
    "log_activity",
    {
      activity_type: z.enum([
        "file_read",
        "file_write",
        "search",
        "command",
        "topic_shift",
      ]).describe("Type of activity"),
      detail: z.string().describe("Activity detail (file path, query, command, topic)"),
      tokens: z.number().optional().describe("Estimated tokens (auto-calculated if omitted)"),
      topic: z.string().optional().describe("Explicit topic override"),
    },
    async ({ activity_type, detail, tokens, topic }) => {
      if (!config.shadow_enabled) {
        return {
          content: [{
            type: "text" as const,
            text: "Shadow log is disabled.",
          }],
        };
      }

      try {
        const sessionId = getCurrentSessionId();
        const activity = createActivity(activity_type, detail, tokens);
        const shadow = recordActivity(sessionId, activity, topic);

        // Check if nearing threshold
        const tokenProgress = (shadow.tokens / config.shadow_token_threshold) * 100;
        const timeProgress = (getActiveMinutes(shadow) / config.shadow_time_threshold_min) * 100;
        const maxProgress = Math.max(tokenProgress, timeProgress);

        let statusMsg = `✓ Activity logged to shadow "${shadow.topic}"`;
        if (maxProgress >= 80) {
          statusMsg += `\n⚡ Near promotion threshold (${Math.round(maxProgress)}%)`;
        }

        return {
          content: [{
            type: "text" as const,
            text:
              `${statusMsg}\n` +
              `Shadow: ${shadow.id}\n` +
              `Density: ${shadow.tokens}/${config.shadow_token_threshold} tokens (${Math.round(tokenProgress)}%)\n` +
              `Activities: ${shadow.activities.length}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error logging activity: ${error}`,
          }],
        };
      }
    }
  );

  /**
   * BATCH_LOG_ACTIVITIES - Record multiple activities at once
   * Efficient for logging a sequence of operations
   */
  server.tool(
    "batch_log_activities",
    {
      activities: z.array(z.object({
        type: z.enum([
          "file_read",
          "file_write",
          "search",
          "command",
          "topic_shift",
        ]),
        detail: z.string(),
        tokens: z.number().optional(),
        timestamp: z.string().optional(),
      })).describe("Array of activities to log"),
      topic: z.string().optional().describe("Explicit topic for all activities"),
    },
    async ({ activities, topic }) => {
      if (!config.shadow_enabled) {
        return {
          content: [{
            type: "text" as const,
            text: "Shadow log is disabled.",
          }],
        };
      }

      try {
        const sessionId = getCurrentSessionId();
        let shadow = null;

        for (const act of activities) {
          const activity = createActivity(act.type, act.detail, act.tokens);
          if (act.timestamp) {
            activity.timestamp = act.timestamp;
          }
          shadow = recordActivity(sessionId, activity, topic);
        }

        if (!shadow) {
          return {
            content: [{
              type: "text" as const,
              text: "No activities logged (empty batch).",
            }],
          };
        }

        // Check promotion status
        const tokenProgress = (shadow.tokens / config.shadow_token_threshold) * 100;
        const timeProgress = (getActiveMinutes(shadow) / config.shadow_time_threshold_min) * 100;
        const maxProgress = Math.max(tokenProgress, timeProgress);

        let statusMsg = `✓ ${activities.length} activities logged to shadow "${shadow.topic}"`;
        if (maxProgress >= 80) {
          statusMsg += `\n⚡ Near promotion threshold (${Math.round(maxProgress)}%)`;
        }

        return {
          content: [{
            type: "text" as const,
            text:
              `${statusMsg}\n` +
              `Shadow: ${shadow.id}\n` +
              `Density: ${shadow.tokens}/${config.shadow_token_threshold} tokens (${Math.round(tokenProgress)}%)\n` +
              `Total activities: ${shadow.activities.length}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error logging batch: ${error}`,
          }],
        };
      }
    }
  );

  /**
   * SHADOW_STATUS - View all active shadows across sessions
   * Shows working memory state and promotion candidates
   */
  server.tool(
    "shadow_status",
    {
      session_id: z.string().optional().describe("Filter to specific session"),
      include_stats: z.boolean().optional().default(true).describe("Include aggregate statistics"),
    },
    async ({ session_id, include_stats }) => {
      if (!config.shadow_enabled) {
        return {
          content: [{
            type: "text" as const,
            text: "Shadow log is disabled. Enable with shadow_enabled: true in config.",
          }],
        };
      }

      const sections: string[] = [];

      sections.push(
        `╔══════════════════════════════════════════════════════════════╗\n` +
        `║                    SHADOW LOG STATUS                        ║\n` +
        `╚══════════════════════════════════════════════════════════════╝\n`
      );

      // Get shadows
      const shadows = session_id
        ? getSessionShadows(session_id)
        : listActiveShadows();

      if (shadows.length === 0) {
        sections.push("No active shadows in working memory.\n");
      } else {
        sections.push(`👁️ ACTIVE SHADOWS (${shadows.length}):\n`);

        for (const shadow of shadows) {
          const isThisSession = shadow.session_id === getCurrentSessionId();
          const sessionLabel = isThisSession ? "(this session)" : `(${shadow.session_id.slice(0, 12)}...)`;
          const statusEmoji = shadow.status === "active" ? "🟢" : "🟡";
          const activeMin = Math.round(getActiveMinutes(shadow));

          sections.push(
            `  ┌─ ${shadow.topic} ${sessionLabel} ${statusEmoji}\n` +
            `  │ Activity: ${shadow.activities.length} items, ${activeMin}min active\n` +
            `  │ Density: ${shadow.tokens} tokens\n` +
            `  │ Last: ${new Date(shadow.last_activity).toLocaleTimeString()}\n` +
            `  └─────────────────────────────────────────────────────────────`
          );
        }
      }

      // Promotion candidates
      const candidates = checkPromotionThresholds();
      if (candidates.length > 0) {
        sections.push(`\n⚡ PROMOTION CANDIDATES (${candidates.length}):`);
        for (const candidate of candidates) {
          sections.push(
            `  • "${candidate.topic}" - ${candidate.tokens} tokens, ${Math.round(getActiveMinutes(candidate))}min`
          );
        }
        sections.push(`\n💡 Use promote_shadow to convert to long-term memory.`);
      }

      // Recently promoted
      const recentlyPromoted = getRecentlyPromoted();
      if (recentlyPromoted.length > 0) {
        sections.push(`\n✨ RECENTLY PROMOTED:`);
        for (const promoted of recentlyPromoted.slice(-5)) {
          sections.push(
            `  • [shadow→memory] "${promoted.topic}" → ${promoted.memory_id}`
          );
        }
      }

      // Stats
      if (include_stats) {
        const stats = getShadowStats();
        sections.push(
          `\n📊 STATISTICS:\n` +
          `  Total entries: ${stats.total}\n` +
          `  Active: ${stats.active}, Idle: ${stats.idle}\n` +
          `  Promoted: ${stats.promoted}, Decayed: ${stats.decayed}\n` +
          `  Working memory tokens: ${stats.totalTokens}`
        );
      }

      // Config info
      sections.push(
        `\n⚙️ THRESHOLDS:\n` +
        `  Token threshold: ${config.shadow_token_threshold}\n` +
        `  Time threshold: ${config.shadow_time_threshold_min}min\n` +
        `  Idle timeout: ${config.shadow_idle_timeout_min}min`
      );

      return {
        content: [{
          type: "text" as const,
          text: sections.join("\n"),
        }],
      };
    }
  );

  /**
   * PROMOTE_SHADOW - Manually promote a shadow to long-term memory
   */
  server.tool(
    "promote_shadow",
    {
      shadow_id: z.string().optional().describe("Specific shadow ID to promote (or promotes first candidate)"),
      topic: z.string().optional().describe("Promote shadow by topic name"),
      custom_summary: z.string().optional().describe("Override auto-generated summary"),
    },
    async ({ shadow_id, topic, custom_summary }) => {
      if (!config.shadow_enabled) {
        return {
          content: [{
            type: "text" as const,
            text: "Shadow log is disabled.",
          }],
        };
      }

      // Find the shadow to promote
      let shadow = null;

      if (shadow_id) {
        shadow = getShadowById(shadow_id);
      } else if (topic) {
        const shadows = listActiveShadows();
        shadow = shadows.find(s => s.topic === topic);
      } else {
        // Promote first candidate
        const candidates = checkPromotionThresholds();
        if (candidates.length > 0) {
          shadow = candidates[0];
        }
      }

      if (!shadow) {
        return {
          content: [{
            type: "text" as const,
            text: shadow_id
              ? `Shadow ${shadow_id} not found.`
              : topic
                ? `No active shadow found for topic "${topic}".`
                : "No promotion candidates available.",
          }],
        };
      }

      // Generate summary
      const summary = custom_summary || generateShadowSummary(shadow);

      // Create memory from shadow
      const memoryId = await saveMemory({
        content: summary,
        type: "shadow",
        tags: [shadow.topic, "auto-promoted", "shadow-log"],
        importance: 2,  // Low importance, can be elevated by dream
        project: shadow.project || config.current_project,
        session_id: shadow.session_id,
        timestamp: new Date().toISOString(),
        metadata: {
          source: "shadow_promotion",
          original_shadow_id: shadow.id,
          activity_count: shadow.activities.length,
          token_density: shadow.tokens,
          active_minutes: Math.round(getActiveMinutes(shadow)),
        },
      });

      // Mark shadow as promoted
      markShadowPromoted(shadow.id, memoryId);

      return {
        content: [{
          type: "text" as const,
          text:
            `✨ SHADOW PROMOTED TO MEMORY\n` +
            `${"─".repeat(50)}\n\n` +
            `Shadow: ${shadow.id}\n` +
            `Topic: ${shadow.topic}\n` +
            `Memory ID: ${memoryId}\n\n` +
            `Summary:\n${summary}\n\n` +
            `Stats: ${shadow.activities.length} activities, ${shadow.tokens} tokens, ${Math.round(getActiveMinutes(shadow))}min`,
        }],
      };
    }
  );
}
