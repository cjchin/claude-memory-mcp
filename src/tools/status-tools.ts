/**
 * Status Tools - Unified system status dashboard
 *
 * Consolidates all status/introspection tools into a single interface
 * with section-based querying for flexibility.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMemoryStats, getCurrentSessionId, listProjects } from "../db.js";
import { config } from "../config.js";
import { getShadowStats, getSessionShadows } from "../shadow-log.js";
import { policyEngine } from "./policy-tools.js";
import { isLLMAvailable, getLLMProvider } from "../llm.js";
import { getSessionStats as getReviewSessionStats } from "./state.js";
import { formatHeader, formatTable, formatDivider } from "./formatters.js";

/**
 * SYSTEM_STATUS - Unified status dashboard
 *
 * Query system health and statistics across all components.
 *
 * **Detail levels:**
 * - quick: Essential info only (session, memory count, health)
 * - normal: Standard dashboard with all sections (default)
 * - detailed: Full diagnostics with debug info
 *
 * **Section filtering:**
 * Specify which sections to include (omit for all):
 * - health: Core system health (session, ChromaDB connection)
 * - memory: Memory statistics and breakdown
 * - shadow: Shadow/working memory status
 * - policy: Trust policy engine status
 * - llm: LLM configuration and availability
 * - review: Review session state (contradictions/consolidations)
 * - capabilities: Feature introspection
 */
export function registerStatusTools(server: McpServer): void {
  server.tool(
    "system_status",
    {
      detail: z.enum(["quick", "normal", "detailed"])
        .optional()
        .default("normal")
        .describe("Detail level: quick (essentials), normal (full dashboard), detailed (diagnostics)"),
      sections: z.array(z.enum(["health", "memory", "shadow", "policy", "llm", "review", "capabilities"]))
        .optional()
        .describe("Specific sections to include (omit for all)"),
    },
    async ({ detail, sections }) => {
      try {
        const detailLevel = detail || "normal";
        const requestedSections = sections || ["health", "memory", "shadow", "policy", "llm", "review"];
        const output: string[] = [];

        // Header
        if (detailLevel === "quick") {
          output.push("🧠 Soul Status - Quick View");
          output.push(formatDivider(40, "─"));
        } else {
          output.push(formatHeader("SOUL SYSTEM STATUS", 60));
        }

        output.push("");

        // ===== HEALTH SECTION =====
        if (requestedSections.includes("health")) {
          const sessionId = getCurrentSessionId();
          const chromaStatus = config.chroma_host && config.chroma_port ? "ONLINE" : "UNCONFIGURED";

          if (detailLevel === "quick") {
            output.push(`✅ Status: ONLINE`);
            output.push(`📍 Session: ${sessionId.slice(0, 12)}...`);
            output.push(`🗂️  Project: ${config.current_project || "none"}`);
          } else {
            output.push("🏥 SYSTEM HEALTH");
            output.push(formatDivider(60));

            const healthData: Record<string, string> = {
              "Status": "✅ ONLINE",
              "Session ID": sessionId,
              "Current Project": config.current_project || "(none)",
              "ChromaDB": `${chromaStatus} (${config.chroma_host}:${config.chroma_port})`,
              "Memory Decay": config.enable_memory_decay ? "Enabled" : "Disabled",
            };

            if (detailLevel === "detailed") {
              healthData["Config Path"] = "~/.claude-memory/config.json";
            }

            output.push(formatTable(healthData));
          }
          output.push("");
        }

        // ===== MEMORY SECTION =====
        if (requestedSections.includes("memory")) {
          const stats = await getMemoryStats();

          if (detailLevel === "quick") {
            output.push(`💾 Memories: ${stats.total} (${stats.recentCount} this week)`);
          } else {
            output.push("💾 MEMORY STATISTICS");
            output.push(formatDivider(60));

            const memoryData: Record<string, string | number> = {
              "Total Memories": stats.total,
              "This Week": stats.recentCount,
              "By Type": "",
            };

            // Add type breakdown
            for (const [type, count] of Object.entries(stats.byType)) {
              memoryData[`  ${type}`] = count;
            }

            // Add project breakdown (if multiple projects)
            if (Object.keys(stats.byProject).length > 1) {
              memoryData["By Project"] = "";
              for (const [project, count] of Object.entries(stats.byProject)) {
                memoryData[`  ${project || "(no project)"}`] = count;
              }
            }

            output.push(formatTable(memoryData));

            if (detailLevel === "detailed") {
              const projects = await listProjects();
              output.push(`\n📊 Configured Projects: ${projects.length}`);
              if (projects.length > 0) {
                output.push(projects.map(p => `   - ${p.name}`).join("\n"));
              }
            }
          }
          output.push("");
        }

        // ===== SHADOW SECTION =====
        if (requestedSections.includes("shadow")) {
          const shadowStats = getShadowStats();
          const sessionShadows = getSessionShadows(getCurrentSessionId());

          if (detailLevel === "quick") {
            output.push(`👁️  Shadows: ${shadowStats.total} (${sessionShadows.length} this session)`);
          } else {
            output.push("👁️ SHADOW/WORKING MEMORY");
            output.push(formatDivider(60));

            const shadowData: Record<string, string | number> = {
              "Total Shadows": shadowStats.total,
              "Active": shadowStats.active,
              "This Session": sessionShadows.length,
              "Total Tokens": shadowStats.totalTokens,
              "Promotion Threshold": `${config.shadow_token_threshold} tokens OR ${config.shadow_time_threshold_min} min`,
            };

            if (detailLevel === "detailed") {
              shadowData["Promoted"] = shadowStats.promoted;
              shadowData["Decayed"] = shadowStats.decayed;
              if (sessionShadows.length > 0) {
                shadowData["Session Topics"] = sessionShadows.map(s => s.topic).join(", ");
              }
            }

            output.push(formatTable(shadowData));
          }
          output.push("");
        }

        // ===== POLICY SECTION =====
        if (requestedSections.includes("policy") && detailLevel !== "quick") {
          output.push("🛡️ TRUST POLICY ENGINE");
          output.push(formatDivider(60));

          const policyData: Record<string, string> = {
            "Status": "Available",
            "Info": "Use policy_status tool for detailed trust scores",
          };

          output.push(formatTable(policyData));
          output.push("");
        }

        // ===== LLM SECTION =====
        if (requestedSections.includes("llm") && detailLevel !== "quick") {
          output.push("🤖 LLM CONFIGURATION");
          output.push(formatDivider(60));

          const llmProvider = getLLMProvider();
          const llmAvailable = await isLLMAvailable();

          const llmData: Record<string, string> = {
            "Status": llmAvailable ? "✅ Available" : "❌ Unavailable",
            "Provider": llmProvider?.name || "(none)",
            "Dream LLM": config.dream_use_llm ? "Enabled" : "Disabled",
          };

          if (detailLevel === "detailed") {
            llmData["Info"] = "Use llm_status tool for detailed configuration";
          }

          output.push(formatTable(llmData));
          output.push("");
        }

        // ===== REVIEW SESSION SECTION =====
        if (requestedSections.includes("review") && detailLevel !== "quick") {
          output.push("🔍 REVIEW SESSIONS");
          output.push(formatDivider(60));

          const reviewStats = getReviewSessionStats();

          const reviewData: Record<string, string | number> = {
            "Active Sessions": reviewStats.active,
            "Stale Sessions": reviewStats.stale,
            "Memory Usage": `~${reviewStats.memoryEstimateKB} KB`,
          };

          output.push(formatTable(reviewData));
          output.push("");
        }

        // ===== CAPABILITIES SECTION =====
        if (requestedSections.includes("capabilities")) {
          if (detailLevel === "quick") {
            output.push(`🔧 Features: embeddings, semantic search, shadow log, dream state`);
          } else {
            output.push("🔧 CAPABILITIES");
            output.push(formatDivider(60));

            const capabilities = [
              "✓ Semantic search (all-MiniLM-L6-v2)",
              "✓ Shadow/working memory",
              "✓ Dream state processing",
              "✓ Graph enrichment & semantic links",
              "✓ Temporal reasoning",
              "✓ Auto-detection of insights",
              "✓ Trust policy engine",
              "✓ Multi-project support",
            ];

            if (config.dream_use_llm && await isLLMAvailable()) {
              capabilities.push("✓ LLM-assisted dream processing");
            }

            output.push(capabilities.join("\n"));
            output.push("");
          }
        }

        // Footer
        if (detailLevel !== "quick") {
          output.push(formatDivider(60));
          output.push("💡 Use sections: [...] to query specific components");
          output.push("   detail: \"quick\" for essentials, \"detailed\" for diagnostics");
        }

        return {
          content: [{
            type: "text" as const,
            text: output.join("\n"),
          }],
        };
      } catch (error) {
        console.error("Error in system_status:", error);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
