/**
 * Dream & Conscious Processing Tools
 *
 * Memory maintenance and conscious review operations:
 * - run_dream: Execute dream cycle (consolidation, contradiction, decay, prune)
 * - detect_contradictions: Find conflicting memories
 * - find_consolidation_candidates: Find mergeable memories
 * - review_contradiction: Pull one contradiction for conscious evaluation
 * - resolve_contradiction: Apply conscious decision about a contradiction
 * - review_consolidation: Pull one consolidation candidate for evaluation
 * - apply_consolidation: Apply conscious merge decision
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listMemories,
  updateMemory,
  deleteMemory,
  saveMemory,
  supersedeMemory,
} from "../db.js";
import type { DreamOperation } from "../types.js";
import {
  runDreamCycle,
  runDreamCycleWithMutations,
  detectContradiction,
  findConsolidationCandidatesWithEmbeddings,
  type DreamDbOperations,
  type ContradictionCandidate,
  type ConsolidationCandidate,
} from "../dream.js";

const consciousReviewState = {
  contradictions: [] as ContradictionCandidate[],
  consolidations: [] as ConsolidationCandidate[],
  currentContradictionIndex: 0,
  currentConsolidationIndex: 0,
  initialized: false,
};

export function registerDreamTools(server: McpServer): void {
// ============ DREAM STATE - MEMORY REORGANIZATION ============

/**
 * RUN_DREAM triggers the dream cycle for memory maintenance.
 * Operations:
 * - consolidate: Merge near-duplicate memories using semantic similarity
 * - contradiction: Detect conflicting memories
 * - decay: Apply time-based importance decay
 * - prune: Mark very low importance memories for removal
 */
server.tool(
  "run_dream",
  {
    operations: z.array(z.enum(["consolidate", "contradiction", "decay", "prune"]))
      .optional()
      .default(["consolidate", "contradiction", "decay"])
      .describe("Which dream operations to run. Default: all except prune"),
    dry_run: z.boolean()
      .optional()
      .default(true)
      .describe("Preview changes without applying. Default: true for safety"),
    project: z.string()
      .optional()
      .describe("Limit to memories in this project"),
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.85)
      .describe("Threshold for consolidation. 0.85 = very similar, 0.7 = somewhat similar"),
  },
  async ({ operations, dry_run, project, similarity_threshold }) => {
    // Get all memories
    let memories = await listMemories({
      limit: 1000,
      project: project || undefined,
    });

    if (memories.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "🌙 No memories to process in dream cycle.",
        }],
      };
    }

    const sections: string[] = [];
    sections.push(`🌙 DREAM CYCLE ${dry_run ? "(DRY RUN)" : ""}\n${"=".repeat(50)}\n`);
    sections.push(`Processing ${memories.length} memories...`);
    sections.push(`Operations: ${operations.join(", ")}`);
    if (project) sections.push(`Project filter: ${project}`);
    sections.push("");

    // Create DB operations wrapper for mutations
    const dbOps: DreamDbOperations = {
      updateMemory: async (id, updates) => {
        await updateMemory(id, updates);
      },
      deleteMemory: async (id) => {
        await deleteMemory(id);
      },
      saveMemory: async (memory) => {
        return await saveMemory(memory);
      },
      supersedeMemory: async (oldId, newId) => {
        await supersedeMemory(oldId, newId);
      },
    };

    // Run the dream cycle
    const report = dry_run
      ? runDreamCycle(memories, {
          operations: operations as DreamOperation[],
          dryRun: true,
          consolidationThreshold: similarity_threshold,
        })
      : await runDreamCycleWithMutations(memories, {
          operations: operations as DreamOperation[],
          dryRun: false,
          consolidationThreshold: similarity_threshold,
        }, dbOps);

    // Format report
    if (operations.includes("contradiction")) {
      sections.push(`\n⚡ CONTRADICTIONS: ${report.contradictions_found.length}`);
      for (const c of report.contradictions_found.slice(0, 10)) {
        sections.push(`  • [${c.conflict_type}] ${c.memory_a} ↔ ${c.memory_b}`);
        sections.push(`    ${c.explanation}`);
      }
      if (report.contradictions_found.length > 10) {
        sections.push(`  ... and ${report.contradictions_found.length - 10} more`);
      }
    }

    if (operations.includes("consolidate")) {
      sections.push(`\n🔗 CONSOLIDATION CANDIDATES: ${report.consolidations}`);
      if (report.summaries_created.length > 0) {
        sections.push(`  Created ${report.summaries_created.length} merged memories`);
      }
    }

    if (operations.includes("decay")) {
      sections.push(`\n📉 MEMORIES DECAYED: ${report.memories_decayed}`);
    }

    if (operations.includes("prune")) {
      sections.push(`\n🗑️ MEMORIES PRUNED: ${report.memories_pruned}`);
    }

    sections.push(`\n⏱️ Duration: ${new Date(report.completed_at).getTime() - new Date(report.started_at).getTime()}ms`);

    if (dry_run) {
      sections.push(`\n💡 This was a dry run. Use dry_run: false to apply changes.`);
    } else {
      sections.push(`\n✅ Dream cycle completed. Database updated.`);
    }

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

/**
 * DETECT_CONTRADICTIONS finds conflicting memories without running full dream cycle.
 * Useful for investigating specific areas of potential conflict.
 */
server.tool(
  "detect_contradictions",
  {
    project: z.string()
      .optional()
      .describe("Limit search to this project"),
    min_confidence: z.number()
      .min(0)
      .max(1)
      .optional()
      .default(0.6)
      .describe("Minimum confidence threshold for reporting conflicts"),
  },
  async ({ project, min_confidence }) => {
    let memories = await listMemories({
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
        if (conflict && conflict.confidence >= min_confidence) {
          contradictions.push(conflict);
        }
      }
    }

    if (contradictions.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No contradictions found among ${memories.length} memories.`,
        }],
      };
    }

    // Sort by confidence descending
    contradictions.sort((a, b) => b.confidence - a.confidence);

    const sections: string[] = [];
    sections.push(`⚡ CONTRADICTIONS DETECTED: ${contradictions.length}\n`);

    for (const c of contradictions) {
      const emoji = c.conflict_type === "temporal" ? "🕐" : c.conflict_type === "direct" ? "❌" : "🔀";
      sections.push(`${emoji} ${c.conflict_type.toUpperCase()} (${(c.confidence * 100).toFixed(0)}% confidence)`);
      sections.push(`   Memory A: ${c.memory_a.content.slice(0, 80)}...`);
      sections.push(`   Memory B: ${c.memory_b.content.slice(0, 80)}...`);
      sections.push(`   ${c.explanation}`);
      sections.push("");
    }

    sections.push(`💡 To resolve temporal conflicts, consider running:`);
    sections.push(`   run_dream({ operations: ["contradiction"], dry_run: false })`);

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

/**
 * FIND_CONSOLIDATION_CANDIDATES finds memories that could be merged.
 * Uses semantic (embedding) similarity for accurate detection.
 */
server.tool(
  "find_consolidation_candidates",
  {
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.8)
      .describe("How similar memories must be to merge. 0.8 = quite similar"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    limit: z.number()
      .optional()
      .default(100)
      .describe("Max memories to analyze (embedding is slow for large sets)"),
  },
  async ({ similarity_threshold, project, limit }) => {
    const memories = await listMemories({
      limit,
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

    const sections: string[] = [];
    sections.push(`🔍 Analyzing ${memories.length} memories for consolidation...`);
    sections.push(`   Similarity threshold: ${(similarity_threshold * 100).toFixed(0)}%\n`);

    const candidates = await findConsolidationCandidatesWithEmbeddings(memories, similarity_threshold);

    if (candidates.length === 0) {
      sections.push(`✅ No consolidation candidates found at ${(similarity_threshold * 100).toFixed(0)}% similarity.`);
      sections.push(`   Try lowering the threshold if you want to find more similar memories.`);
    } else {
      sections.push(`📦 CONSOLIDATION CANDIDATES: ${candidates.length}\n`);

      for (let i = 0; i < Math.min(candidates.length, 10); i++) {
        const c = candidates[i];
        sections.push(`Group ${i + 1} (${c.memories.length} memories, ${(c.similarity * 100).toFixed(0)}% similar):`);
        for (const m of c.memories.slice(0, 3)) {
          sections.push(`  • [${m.id.slice(0, 12)}...] ${m.content.slice(0, 60)}...`);
        }
        if (c.memories.length > 3) {
          sections.push(`  ... and ${c.memories.length - 3} more`);
        }
        sections.push(`  📝 Merge rationale: ${c.mergeRationale}`);
        sections.push("");
      }

      if (candidates.length > 10) {
        sections.push(`... and ${candidates.length - 10} more groups`);
      }

      sections.push(`\n💡 To apply consolidation, run:`);
      sections.push(`   run_dream({ operations: ["consolidate"], dry_run: false })`);
      sections.push(`   OR use review_consolidation to evaluate each one consciously.`);
    }

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

// ============ CONSCIOUS PROCESSING - LLM-IN-THE-LOOP ============

/**
 * These tools enable "conscious" processing where Claude evaluates each item
 * individually with full reasoning, rather than automatic/heuristic processing.
 * 
 * Flow:
 * 1. review_* tool returns ONE candidate with full context
 * 2. Claude (you) evaluates with full reasoning capability
 * 3. apply_* tool executes Claude's decision
 */

// In-memory queue for conscious review (cleared on restart)
const consciousReviewState = {
  contradictions: [] as ContradictionCandidate[],
  consolidations: [] as ConsolidationCandidate[],
  currentContradictionIndex: 0,
  currentConsolidationIndex: 0,
  initialized: false,
};

/**
 * REVIEW_CONTRADICTION - Pull ONE contradiction for conscious evaluation.
 * 
 * This is the "conscious" pathway - instead of automatic resolution,
 * YOU (Claude) evaluate whether this is a real conflict and how to resolve it.
 */
server.tool(
  "review_contradiction",
  {
    refresh: z.boolean()
      .optional()
      .default(false)
      .describe("Refresh the queue by re-scanning memories"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    skip: z.boolean()
      .optional()
      .default(false)
      .describe("Skip current and move to next without resolving"),
  },
  async ({ refresh, project, skip }) => {
    // Skip if requested
    if (skip && consciousReviewState.contradictions.length > 0) {
      consciousReviewState.currentContradictionIndex++;
    }

    // Refresh or initialize the queue
    if (refresh || !consciousReviewState.initialized || consciousReviewState.contradictions.length === 0) {
      const memories = await listMemories({
        limit: 500,
        project: project || undefined,
      });

      consciousReviewState.contradictions = [];
      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const conflict = detectContradiction(memories[i], memories[j]);
          if (conflict && conflict.confidence >= 0.6) {
            consciousReviewState.contradictions.push(conflict);
          }
        }
      }
      consciousReviewState.contradictions.sort((a, b) => b.confidence - a.confidence);
      consciousReviewState.currentContradictionIndex = 0;
      consciousReviewState.initialized = true;
    }

    const idx = consciousReviewState.currentContradictionIndex;
    const total = consciousReviewState.contradictions.length;

    if (idx >= total) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No more contradictions to review.\n\nReviewed ${total} total. Use { refresh: true } to re-scan.`,
        }],
      };
    }

    const c = consciousReviewState.contradictions[idx];
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
🧠 YOUR EVALUATION NEEDED:
1. Is this a real contradiction, or a false positive?
2. If real, which memory is correct/current?
3. Should the loser be:
   - Superseded (marked as replaced by winner)
   - Updated (merge info from both)
   - Deleted (completely wrong)
   - Kept (they're actually compatible)

To resolve, call resolve_contradiction with your decision.
To skip this one, call review_contradiction({ skip: true }).
`;

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    };
  }
);

/**
 * RESOLVE_CONTRADICTION - Apply your conscious decision about a contradiction.
 */
server.tool(
  "resolve_contradiction",
  {
    action: z.enum(["supersede_a", "supersede_b", "keep_both", "merge", "delete_a", "delete_b"])
      .describe("supersede_a: B wins, A marked old. supersede_b: A wins. keep_both: false positive. merge: combine into new. delete: remove."),
    merged_content: z.string()
      .optional()
      .describe("If action=merge, provide the combined content"),
    reasoning: z.string()
      .optional()
      .describe("Your reasoning for this decision (stored for learning)"),
  },
  async ({ action, merged_content, reasoning }) => {
    const idx = consciousReviewState.currentContradictionIndex;
    if (idx >= consciousReviewState.contradictions.length) {
      return {
        content: [{
          type: "text" as const,
          text: "❌ No contradiction currently being reviewed. Call review_contradiction first.",
        }],
      };
    }

    const c = consciousReviewState.contradictions[idx];
    let resultText = "";

    try {
      switch (action) {
        case "supersede_a":
          // B wins, A is superseded
          await supersedeMemory(c.memory_a.id, c.memory_b.id);
          resultText = `✅ Memory A superseded by Memory B.\n   "${c.memory_a.content.slice(0, 50)}..." → marked as replaced.`;
          break;

        case "supersede_b":
          // A wins, B is superseded
          await supersedeMemory(c.memory_b.id, c.memory_a.id);
          resultText = `✅ Memory B superseded by Memory A.\n   "${c.memory_b.content.slice(0, 50)}..." → marked as replaced.`;
          break;

        case "keep_both":
          resultText = `✅ Keeping both memories (false positive or compatible).\n   No changes made.`;
          break;

        case "merge":
          if (!merged_content) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ merge action requires merged_content parameter.",
              }],
            };
          }
          // Create merged memory, supersede both originals
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
      consciousReviewState.currentContradictionIndex++;
      const remaining = consciousReviewState.contradictions.length - consciousReviewState.currentContradictionIndex;
      
      resultText += `\n\n${remaining} contradiction(s) remaining.`;
      if (remaining > 0) {
        resultText += `\nCall review_contradiction to see the next one.`;
      }

      if (reasoning) {
        resultText += `\n\n📝 Reasoning recorded: "${reasoning}"`;
      }

    } catch (error) {
      resultText = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      content: [{
        type: "text" as const,
        text: resultText,
      }],
    };
  }
);

/**
 * REVIEW_CONSOLIDATION - Pull ONE consolidation candidate for conscious evaluation.
 * 
 * Instead of heuristic merge, YOU decide what content to keep/combine.
 */
server.tool(
  "review_consolidation",
  {
    refresh: z.boolean()
      .optional()
      .default(false)
      .describe("Refresh queue by re-scanning with embeddings"),
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.8)
      .describe("Similarity threshold for finding candidates"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    skip: z.boolean()
      .optional()
      .default(false)
      .describe("Skip current without merging"),
  },
  async ({ refresh, similarity_threshold, project, skip }) => {
    // Skip if requested
    if (skip && consciousReviewState.consolidations.length > 0) {
      consciousReviewState.currentConsolidationIndex++;
    }

    // Refresh or initialize
    if (refresh || consciousReviewState.consolidations.length === 0) {
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

      consciousReviewState.consolidations = await findConsolidationCandidatesWithEmbeddings(
        memories, 
        similarity_threshold
      );
      consciousReviewState.currentConsolidationIndex = 0;
    }

    const idx = consciousReviewState.currentConsolidationIndex;
    const total = consciousReviewState.consolidations.length;

    if (idx >= total) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No more consolidation candidates to review.\n\nReviewed ${total} total. Use { refresh: true } to re-scan.`,
        }],
      };
    }

    const c = consciousReviewState.consolidations[idx];
    
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
🧠 YOUR EVALUATION NEEDED:
1. Should these memories be merged?
2. If yes, what should the final content be?
   - Keep one as-is?
   - Combine key points from both?
   - Rewrite for clarity?
3. What tags and importance should the result have?

To apply, call apply_consolidation with your decision.
To skip, call review_consolidation({ skip: true }).
`;

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    };
  }
);

/**
 * APPLY_CONSOLIDATION - Apply your conscious merge decision.
 */
server.tool(
  "apply_consolidation",
  {
    action: z.enum(["merge", "keep_all", "keep_first", "keep_best"])
      .describe("merge: create new from your content. keep_all: false positive. keep_first/keep_best: delete others."),
    merged_content: z.string()
      .optional()
      .describe("If action=merge, YOUR synthesized content (not the heuristic!)"),
    merged_tags: z.array(z.string())
      .optional()
      .describe("Tags for the merged memory"),
    merged_importance: z.number()
      .min(1)
      .max(5)
      .optional()
      .describe("Importance 1-5 for merged memory"),
    reasoning: z.string()
      .optional()
      .describe("Your reasoning for merge decisions"),
  },
  async ({ action, merged_content, merged_tags, merged_importance, reasoning }) => {
    const idx = consciousReviewState.currentConsolidationIndex;
    if (idx >= consciousReviewState.consolidations.length) {
      return {
        content: [{
          type: "text" as const,
          text: "❌ No consolidation currently being reviewed. Call review_consolidation first.",
        }],
      };
    }

    const c = consciousReviewState.consolidations[idx];
    let resultText = "";

    try {
      switch (action) {
        case "merge":
          if (!merged_content) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ merge action requires merged_content parameter with YOUR synthesized content.",
              }],
            };
          }
          
          // Create the merged memory
          const bestOriginal = c.memories.reduce((best, m) => 
            m.importance > best.importance ? m : best
          );
          
          const newId = await saveMemory({
            content: merged_content,
            type: bestOriginal.type,
            tags: merged_tags || [...new Set(c.memories.flatMap(m => m.tags))],
            timestamp: new Date().toISOString(),
            importance: merged_importance || Math.max(...c.memories.map(m => m.importance)),
            source: "conscious_consolidation",
            layer: bestOriginal.layer || "long_term",
            valid_from: new Date().toISOString(),
            metadata: {
              consolidated_from: c.memories.map(m => m.id),
              consolidation_reasoning: reasoning,
            },
          });
          
          // Supersede all originals
          for (const m of c.memories) {
            await supersedeMemory(m.id, newId);
          }
          
          resultText = `✅ Created consolidated memory: ${newId}\n   Merged ${c.memories.length} memories into one.\n   Originals marked as superseded.`;
          break;

        case "keep_all":
          resultText = `✅ Keeping all memories (false positive or intentionally separate).\n   No changes made.`;
          break;

        case "keep_first":
          // Keep first, supersede others
          for (let i = 1; i < c.memories.length; i++) {
            await supersedeMemory(c.memories[i].id, c.memories[0].id);
          }
          resultText = `✅ Kept first memory, superseded ${c.memories.length - 1} others.`;
          break;

        case "keep_best":
          // Keep highest importance, supersede others
          const best = c.memories.reduce((b, m) => m.importance > b.importance ? m : b);
          for (const m of c.memories) {
            if (m.id !== best.id) {
              await supersedeMemory(m.id, best.id);
            }
          }
          resultText = `✅ Kept best memory (importance ${best.importance}), superseded ${c.memories.length - 1} others.`;
          break;
      }

      // Move to next
      consciousReviewState.currentConsolidationIndex++;
      const remaining = consciousReviewState.consolidations.length - consciousReviewState.currentConsolidationIndex;
      
      resultText += `\n\n${remaining} consolidation candidate(s) remaining.`;
      if (remaining > 0) {
        resultText += `\nCall review_consolidation to see the next one.`;
      }

      if (reasoning) {
        resultText += `\n\n📝 Reasoning recorded: "${reasoning}"`;
      }

    } catch (error) {
      resultText = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      content: [{
        type: "text" as const,
        text: resultText,
      }],
    };
  }
);

}
