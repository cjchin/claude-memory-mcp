/**
 * Consolidation Tools - Unified memory consolidation interface
 *
 * Provides a clear, unified API for all memory consolidation workflows
 * while maintaining the specialized implementations underneath.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listMemories, consolidateMemories, getCurrentSessionId } from "../db.js";
import { findConsolidationCandidatesWithEmbeddings } from "../dream.js";
import { getReviewSession } from "./state.js";
import { config } from "../config.js";
import { DEDUPE_THRESHOLDS } from "../dedupe.js";

/**
 * CONSOLIDATE_MEMORIES - Unified consolidation interface
 *
 * Three workflow modes:
 * 1. **direct** - Manually merge specific memory IDs (fast, requires IDs)
 * 2. **interactive** - Review candidates one-by-one with Claude's judgment (slow, thorough)
 * 3. **auto** - Automatic batch consolidation with similarity threshold (fast, heuristic)
 *
 * Choose based on your needs:
 * - Use "direct" when you know exactly which memories to merge
 * - Use "interactive" for careful, conscious review of suggestions
 * - Use "auto" for batch processing with automatic heuristics
 */
export function registerConsolidationTools(server: McpServer): void {
  server.tool(
    "consolidate_memories",
    {
      mode: z.enum(["direct", "interactive", "auto"])
        .describe("Workflow mode: direct (manual IDs), interactive (review queue), auto (batch automatic)"),

      // Direct mode parameters
      ids: z.array(z.string())
        .min(2)
        .optional()
        .describe("[direct mode] Memory IDs to merge"),
      merged_content: z.string()
        .optional()
        .describe("[direct mode] The consolidated content"),
      keep_metadata_from: z.string()
        .optional()
        .describe("[direct mode] ID of memory whose metadata to keep"),

      // Interactive mode parameters
      action: z.enum(["start", "next", "skip", "merge", "keep_all", "keep_first", "keep_best"])
        .optional()
        .describe("[interactive mode] Action: start (begin review), next (get candidate), skip (skip current), merge/keep_* (apply decision)"),
      merged_tags: z.array(z.string())
        .optional()
        .describe("[interactive mode] Tags for merged memory"),
      merged_importance: z.number()
        .min(1)
        .max(5)
        .optional()
        .describe("[interactive mode] Importance 1-5 for merged memory"),
      reasoning: z.string()
        .optional()
        .describe("[interactive mode] Your reasoning for merge decision"),

      // Shared parameters
      similarity: z.number()
        .min(0.5)
        .max(0.99)
        .optional()
        .default(DEDUPE_THRESHOLDS.STANDARD)
        .describe("Similarity threshold for finding candidates (default: 0.85 STANDARD)"),
      project: z.string()
        .optional()
        .describe("Limit to specific project"),
      dry_run: z.boolean()
        .optional()
        .default(false)
        .describe("[auto mode] Preview without applying changes"),
    },
    async ({
      mode,
      ids,
      merged_content,
      keep_metadata_from,
      action,
      merged_tags,
      merged_importance,
      reasoning,
      similarity,
      project,
      dry_run,
    }) => {
      try {
        // ===== DIRECT MODE: Manual merge of specific IDs =====
        if (mode === "direct") {
          if (!ids || !merged_content || !keep_metadata_from) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ Direct mode requires: ids (array), merged_content (string), keep_metadata_from (string)",
              }],
            };
          }

          const newId = await consolidateMemories(ids, merged_content, keep_metadata_from);
          return {
            content: [{
              type: "text" as const,
              text: `✅ Direct merge complete\n\nMerged ${ids.length} memories → ${newId}\n\nOriginals marked as superseded.`,
            }],
          };
        }

        // ===== INTERACTIVE MODE: Review queue with conscious decisions =====
        if (mode === "interactive") {
          const session = getReviewSession(getCurrentSessionId());
          const currentAction = action || "next";

          // Start/refresh the review queue
          if (currentAction === "start" || session.consolidations.length === 0) {
            const memories = await listMemories({
              limit: 200, // Embeddings are expensive
              project: project || undefined,
            });

            if (memories.length < 2) {
              return {
                content: [{
                  type: "text" as const,
                  text: "Need at least 2 memories to find consolidation candidates.",
                }],
              };
            }

            session.consolidations = await findConsolidationCandidatesWithEmbeddings(
              memories,
              similarity || DEDUPE_THRESHOLDS.STANDARD
            );
            session.currentConsolidationIndex = 0;

            return {
              content: [{
                type: "text" as const,
                text: `📋 Interactive review started\n\nFound ${session.consolidations.length} consolidation candidates.\n\nUse consolidate_memories({ mode: "interactive", action: "next" }) to review first candidate.`,
              }],
            };
          }

          // Skip current candidate
          if (currentAction === "skip") {
            if (session.consolidations.length === 0) {
              return {
                content: [{
                  type: "text" as const,
                  text: "❌ No consolidation review in progress. Use action: \"start\" first.",
                }],
              };
            }
            session.currentConsolidationIndex++;
            const remaining = session.consolidations.length - session.currentConsolidationIndex;
            return {
              content: [{
                type: "text" as const,
                text: `⏭️ Skipped candidate\n\n${remaining} remaining. Use action: "next" to continue.`,
              }],
            };
          }

          // Show next candidate
          if (currentAction === "next") {
            const idx = session.currentConsolidationIndex;
            const total = session.consolidations.length;

            if (idx >= total) {
              return {
                content: [{
                  type: "text" as const,
                  text: `✅ Review complete\n\nReviewed all ${total} candidates. Use action: "start" to refresh queue.`,
                }],
              };
            }

            const c = session.consolidations[idx];

            let memoriesText = "";
            for (let i = 0; i < c.memories.length; i++) {
              const m = c.memories[i];
              memoriesText += `
📄 MEMORY ${i + 1} (${m.type})
   ID: ${m.id}
   Created: ${m.timestamp}
   Importance: ${m.importance}
   Tags: ${m.tags.join(", ") || "none"}

   "${m.content}"
`;
            }

            const text = `
📦 CONSOLIDATION CANDIDATE ${idx + 1}/${total}
${"═".repeat(60)}
Similarity: ${(c.similarity * 100).toFixed(0)}%
Heuristic suggestion: ${c.mergeRationale}

${memoriesText}
${"─".repeat(60)}
🤖 HEURISTIC MERGE (for reference):
"${c.suggestedMerge}"

${"─".repeat(60)}
🧠 YOUR DECISION NEEDED:

Use consolidate_memories with:
- action: "merge" + merged_content: "..." (create new merged memory)
- action: "keep_all" (false positive, keep separate)
- action: "keep_first" (keep first, supersede others)
- action: "keep_best" (keep highest importance)
- action: "skip" (skip this one for now)
`;

            return {
              content: [{
                type: "text" as const,
                text,
              }],
            };
          }

          // Apply consolidation decision
          if (["merge", "keep_all", "keep_first", "keep_best"].includes(currentAction)) {
            const idx = session.currentConsolidationIndex;
            if (idx >= session.consolidations.length) {
              return {
                content: [{
                  type: "text" as const,
                  text: "❌ No consolidation currently being reviewed. Use action: \"next\" first.",
                }],
              };
            }

            const c = session.consolidations[idx];
            let resultText = "";

            switch (currentAction) {
              case "merge": {
                if (!merged_content) {
                  return {
                    content: [{
                      type: "text" as const,
                      text: "❌ Action 'merge' requires merged_content parameter with YOUR synthesized content.",
                    }],
                  };
                }

                const bestOriginal = c.memories.reduce((best, m) =>
                  m.importance > best.importance ? m : best
                );

                const newId = await consolidateMemories(
                  c.memories.map(m => m.id),
                  merged_content,
                  bestOriginal.id,
                  {
                    tags: merged_tags || [...new Set(c.memories.flatMap(m => m.tags))],
                    importance: merged_importance || Math.max(...c.memories.map(m => m.importance)),
                    metadata: {
                      consolidated_from: c.memories.map(m => m.id),
                      consolidation_reasoning: reasoning,
                      source: "conscious_consolidation",
                    },
                  }
                );

                resultText = `✅ Created merged memory: ${newId}\n   Merged ${c.memories.length} memories into one.\n   Originals marked as superseded.`;
                break;
              }

              case "keep_all":
                resultText = `✅ Keeping all memories (false positive or intentionally separate).\n   No changes made.`;
                break;

              case "keep_first": {
                // Keep first, supersede others - need to implement supersedeMemory properly
                resultText = `✅ Kept first memory, would supersede ${c.memories.length - 1} others.\n   (Note: Supersede functionality needs db.supersedeMemory implementation)`;
                break;
              }

              case "keep_best": {
                const best = c.memories.reduce((b, m) => m.importance > b.importance ? m : b);
                resultText = `✅ Kept best memory (importance ${best.importance}), would supersede ${c.memories.length - 1} others.\n   (Note: Supersede functionality needs db.supersedeMemory implementation)`;
                break;
              }
            }

            // Move to next
            session.currentConsolidationIndex++;
            const remaining = session.consolidations.length - session.currentConsolidationIndex;

            resultText += `\n\n${remaining} consolidation candidate(s) remaining.`;
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

        // ===== AUTO MODE: Automatic batch consolidation =====
        if (mode === "auto") {
          const memories = await listMemories({
            limit: 200,
            project: project || undefined,
          });

          if (memories.length < 2) {
            return {
              content: [{
                type: "text" as const,
                text: "Need at least 2 memories for auto consolidation.",
              }],
            };
          }

          const candidates = await findConsolidationCandidatesWithEmbeddings(
            memories,
            similarity || DEDUPE_THRESHOLDS.STANDARD
          );

          if (dry_run) {
            return {
              content: [{
                type: "text" as const,
                text: `🔍 Auto consolidation preview\n\nFound ${candidates.length} consolidation candidates.\n\nUse dry_run: false to apply automatic merges.`,
              }],
            };
          }

          // Apply automatic merges
          let mergedCount = 0;
          for (const candidate of candidates) {
            try {
              const bestOriginal = candidate.memories.reduce((best, m) =>
                m.importance > best.importance ? m : best
              );

              await consolidateMemories(
                candidate.memories.map(m => m.id),
                candidate.suggestedMerge,
                bestOriginal.id,
                {
                  metadata: {
                    source: "auto_consolidation",
                    similarity: candidate.similarity,
                  },
                }
              );
              mergedCount++;
            } catch (error) {
              console.error("Error auto-merging candidate:", error);
            }
          }

          return {
            content: [{
              type: "text" as const,
              text: `✅ Auto consolidation complete\n\nProcessed ${candidates.length} candidates.\nSuccessfully merged ${mergedCount} sets of memories.`,
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
        console.error("Error in consolidate_memories:", error);
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
