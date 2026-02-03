/**
 * Contradiction Tools - Unified contradiction handling interface
 *
 * Provides a clear, unified API for detecting and resolving contradictions
 * while maintaining the specialized implementations underneath.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listMemories, getCurrentSessionId, supersedeMemory, deleteMemory, saveMemory } from "../db.js";
import { detectContradiction, type ContradictionCandidate } from "../dream.js";
import { getReviewSession } from "./state.js";

/**
 * HANDLE_CONTRADICTIONS - Unified contradiction handling
 *
 * Three workflow modes:
 * 1. **detect** - Scan for contradictions and return list (no resolution)
 * 2. **interactive** - Review contradictions one-by-one with conscious judgment
 * 3. **auto** - Automatic resolution with heuristics (future: LLM-assisted)
 *
 * Choose based on your needs:
 * - Use "detect" for awareness and reporting
 * - Use "interactive" for careful, conscious resolution
 * - Use "auto" for batch processing (when implemented)
 */
export function registerContradictionTools(server: McpServer): void {
  server.tool(
    "handle_contradictions",
    {
      mode: z.enum(["detect", "interactive", "auto"])
        .describe("Workflow mode: detect (scan only), interactive (review queue), auto (batch automatic)"),

      // Detection parameters
      min_confidence: z.number()
        .min(0)
        .max(1)
        .optional()
        .default(0.6)
        .describe("Minimum confidence threshold for reporting conflicts"),
      project: z.string()
        .optional()
        .describe("Limit to specific project"),

      // Interactive mode parameters
      action: z.enum(["start", "next", "skip", "supersede_a", "supersede_b", "keep_both", "merge", "delete_a", "delete_b"])
        .optional()
        .describe("[interactive mode] Action: start (begin review), next (get contradiction), skip, supersede_*, keep_both, merge, delete_*"),
      merged_content: z.string()
        .optional()
        .describe("[interactive mode] If action=merge, provide the combined content"),
      reasoning: z.string()
        .optional()
        .describe("[interactive mode] Your reasoning for this decision"),

      // Auto mode parameters
      dry_run: z.boolean()
        .optional()
        .default(false)
        .describe("[auto mode] Preview without applying changes"),
    },
    async ({
      mode,
      min_confidence,
      project,
      action,
      merged_content,
      reasoning,
      dry_run,
    }) => {
      try {
        // ===== DETECT MODE: Scan for contradictions =====
        if (mode === "detect") {
          const memories = await listMemories({
            limit: 500,
            project: project || undefined,
          });

          if (memories.length < 2) {
            return {
              content: [{
                type: "text" as const,
                text: "Need at least 2 memories to detect contradictions.",
              }],
            };
          }

          const contradictions: ContradictionCandidate[] = [];

          for (let i = 0; i < memories.length; i++) {
            for (let j = i + 1; j < memories.length; j++) {
              const conflict = detectContradiction(memories[i], memories[j]);
              if (conflict && conflict.confidence >= (min_confidence || 0.6)) {
                contradictions.push(conflict);
              }
            }
          }

          if (contradictions.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `✅ No contradictions found\n\nScanned ${memories.length} memories with confidence threshold ${(min_confidence || 0.6) * 100}%.`,
              }],
            };
          }

          // Sort by confidence (highest first)
          contradictions.sort((a, b) => b.confidence - a.confidence);

          // Format output
          let text = `⚠️ Found ${contradictions.length} contradiction(s)\n${"═".repeat(60)}\n\n`;

          for (let i = 0; i < Math.min(contradictions.length, 10); i++) {
            const c = contradictions[i];
            const emoji = c.conflict_type === "temporal" ? "🕐" : "❌";
            text += `${emoji} #${i + 1} - ${c.conflict_type.toUpperCase()} (${(c.confidence * 100).toFixed(0)}%)\n`;
            text += `   ${c.explanation}\n`;
            text += `   A: ${c.memory_a.id.slice(0, 12)}... "${c.memory_a.content.slice(0, 50)}..."\n`;
            text += `   B: ${c.memory_b.id.slice(0, 12)}... "${c.memory_b.content.slice(0, 50)}..."\n\n`;
          }

          if (contradictions.length > 10) {
            text += `... and ${contradictions.length - 10} more.\n\n`;
          }

          text += `To resolve interactively, use:\n   handle_contradictions({ mode: "interactive", action: "start" })`;

          return {
            content: [{
              type: "text" as const,
              text,
            }],
          };
        }

        // ===== INTERACTIVE MODE: Review queue with conscious decisions =====
        if (mode === "interactive") {
          const session = getReviewSession(getCurrentSessionId());
          const currentAction = action || "next";

          // Start/refresh the review queue
          if (currentAction === "start" || !session.initialized || session.contradictions.length === 0) {
            const memories = await listMemories({
              limit: 500,
              project: project || undefined,
            });

            if (memories.length < 2) {
              return {
                content: [{
                  type: "text" as const,
                  text: "Need at least 2 memories to detect contradictions.",
                }],
              };
            }

            session.contradictions = [];
            for (let i = 0; i < memories.length; i++) {
              for (let j = i + 1; j < memories.length; j++) {
                const conflict = detectContradiction(memories[i], memories[j]);
                if (conflict && conflict.confidence >= (min_confidence || 0.6)) {
                  session.contradictions.push(conflict);
                }
              }
            }

            session.contradictions.sort((a, b) => b.confidence - a.confidence);
            session.currentContradictionIndex = 0;
            session.initialized = true;

            return {
              content: [{
                type: "text" as const,
                text: `📋 Interactive review started\n\nFound ${session.contradictions.length} contradictions.\n\nUse handle_contradictions({ mode: "interactive", action: "next" }) to review first contradiction.`,
              }],
            };
          }

          // Skip current contradiction
          if (currentAction === "skip") {
            if (session.contradictions.length === 0) {
              return {
                content: [{
                  type: "text" as const,
                  text: "❌ No contradiction review in progress. Use action: \"start\" first.",
                }],
              };
            }
            session.currentContradictionIndex++;
            const remaining = session.contradictions.length - session.currentContradictionIndex;
            return {
              content: [{
                type: "text" as const,
                text: `⏭️ Skipped contradiction\n\n${remaining} remaining. Use action: "next" to continue.`,
              }],
            };
          }

          // Show next contradiction
          if (currentAction === "next") {
            const idx = session.currentContradictionIndex;
            const total = session.contradictions.length;

            if (idx >= total) {
              return {
                content: [{
                  type: "text" as const,
                  text: `✅ Review complete\n\nReviewed all ${total} contradictions. Use action: "start" to refresh queue.`,
                }],
              };
            }

            const c = session.contradictions[idx];
            const emoji = c.conflict_type === "temporal" ? "🕐" : "❌";

            const text = `
${emoji} CONTRADICTION ${idx + 1}/${total} - ${c.conflict_type.toUpperCase()}
${"═".repeat(60)}
Confidence: ${(c.confidence * 100).toFixed(0)}%
Explanation: ${c.explanation}

📄 MEMORY A (${c.memory_a.type})
   ID: ${c.memory_a.id}
   Created: ${c.memory_a.timestamp}
   Importance: ${c.memory_a.importance}
   Tags: ${c.memory_a.tags.join(", ") || "none"}

   "${c.memory_a.content}"

📄 MEMORY B (${c.memory_b.type})
   ID: ${c.memory_b.id}
   Created: ${c.memory_b.timestamp}
   Importance: ${c.memory_b.importance}
   Tags: ${c.memory_b.tags.join(", ") || "none"}

   "${c.memory_b.content}"

${"─".repeat(60)}
🧠 YOUR DECISION NEEDED:

Use handle_contradictions with:
- action: "supersede_a" (B wins, A marked as replaced)
- action: "supersede_b" (A wins, B marked as replaced)
- action: "keep_both" (false positive, both are valid)
- action: "merge" + merged_content: "..." (combine into new memory)
- action: "delete_a" or "delete_b" (remove incorrect memory)
- action: "skip" (skip this one for now)
`;

            return {
              content: [{
                type: "text" as const,
                text,
              }],
            };
          }

          // Apply resolution decision
          if (["supersede_a", "supersede_b", "keep_both", "merge", "delete_a", "delete_b"].includes(currentAction)) {
            const idx = session.currentContradictionIndex;
            if (idx >= session.contradictions.length) {
              return {
                content: [{
                  type: "text" as const,
                  text: "❌ No contradiction currently being reviewed. Use action: \"next\" first.",
                }],
              };
            }

            const c = session.contradictions[idx];
            let resultText = "";

            switch (currentAction) {
              case "supersede_a":
                await supersedeMemory(c.memory_a.id, c.memory_b.id);
                resultText = `✅ Memory A superseded by Memory B.\n   "${c.memory_a.content.slice(0, 50)}..." → marked as replaced.`;
                break;

              case "supersede_b":
                await supersedeMemory(c.memory_b.id, c.memory_a.id);
                resultText = `✅ Memory B superseded by Memory A.\n   "${c.memory_b.content.slice(0, 50)}..." → marked as replaced.`;
                break;

              case "keep_both":
                resultText = `✅ Keeping both memories (false positive or compatible).\n   No changes made.`;
                break;

              case "merge": {
                if (!merged_content) {
                  return {
                    content: [{
                      type: "text" as const,
                      text: "❌ Action 'merge' requires merged_content parameter.",
                    }],
                  };
                }

                const newId = await saveMemory({
                  content: merged_content,
                  type: c.memory_a.importance >= c.memory_b.importance ? c.memory_a.type : c.memory_b.type,
                  tags: [...new Set([...c.memory_a.tags, ...c.memory_b.tags])],
                  timestamp: new Date().toISOString(),
                  importance: Math.max(c.memory_a.importance, c.memory_b.importance),
                  source: "conscious_merge",
                  layer: c.memory_a.layer || "long_term",
                  valid_from: new Date().toISOString(),
                  metadata: {
                    merged_from: [c.memory_a.id, c.memory_b.id],
                    merge_reasoning: reasoning,
                  },
                });

                await supersedeMemory(c.memory_a.id, newId);
                await supersedeMemory(c.memory_b.id, newId);
                resultText = `✅ Created merged memory: ${newId}\n   Both originals marked as superseded.`;
                break;
              }

              case "delete_a":
                await deleteMemory(c.memory_a.id);
                resultText = `✅ Deleted Memory A.\n   "${c.memory_a.content.slice(0, 50)}..." → removed.`;
                break;

              case "delete_b":
                await deleteMemory(c.memory_b.id);
                resultText = `✅ Deleted Memory B.\n   "${c.memory_b.content.slice(0, 50)}..." → removed.`;
                break;
            }

            // Move to next
            session.currentContradictionIndex++;
            const remaining = session.contradictions.length - session.currentContradictionIndex;

            resultText += `\n\n${remaining} contradiction(s) remaining.`;
            if (remaining > 0) {
              resultText += `\nUse action: "next" to see the next one.`;
            }

            if (reasoning) {
              resultText += `\n\n📝 Reasoning recorded: "${reasoning}"`;
            }

            return {
              content: [{
                type: "text" as const,
                text: resultText,
              }],
            };
          }

          return {
            content: [{
              type: "text" as const,
              text: `❌ Unknown interactive action: ${currentAction}`,
            }],
          };
        }

        // ===== AUTO MODE: Automatic batch resolution =====
        if (mode === "auto") {
          return {
            content: [{
              type: "text" as const,
              text: "⚠️ Auto mode not yet implemented\n\nUse mode: \"detect\" to find contradictions, then mode: \"interactive\" to resolve them.\n\nFuture: Auto mode will use LLM-assisted judgment for batch resolution.",
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `❌ Unknown mode: ${mode}`,
          }],
        };
      } catch (error) {
        console.error("Error in handle_contradictions:", error);
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
