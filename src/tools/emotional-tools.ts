/**
 * Emotional Intelligence MCP Tools - Phase 1 of v3.0 Evolution
 *
 * MCP tools for querying and analyzing emotional dimensions of memories.
 *
 * Tools:
 * - recall_emotional: Semantic search filtered by emotional criteria
 * - emotional_timeline: Track emotional evolution over time
 * - emotional_shift_detector: Identify belief valence changes
 * - infer_emotion: Manually infer emotion for text (testing/debugging)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listMemories, searchMemories } from "../db.js";
import {
  inferEmotionalContext,
  filterByEmotion,
  detectEmotionalShift,
  applyEmotionalDecay,
  daysSinceEmotionalCapture,
} from "../emotional-intelligence.js";
import type { Memory, BasicEmotion } from "../types.js";
import { formatHeader, formatTable, formatDivider, formatList } from "./formatters.js";
import { toolResponse } from "./patterns.js";

/**
 * RECALL_EMOTIONAL - Semantic search with emotional filtering
 *
 * Combines semantic search with emotional criteria to find memories
 * that match both content and emotional dimensions.
 *
 * Examples:
 * - "Find positive memories about database decisions"
 * - "Show high arousal memories about bugs"
 * - "Recall sad memories from last month"
 */
export function registerEmotionalTools(server: McpServer): void {
  server.tool(
    "recall_emotional",
    {
      query: z.string()
        .describe("Semantic search query (what to search for)"),

      emotion: z.enum(["joy", "sadness", "fear", "anger", "surprise", "disgust", "neutral"])
        .optional()
        .describe("Filter by specific emotion"),

      valence: z.enum(["positive", "negative", "neutral"])
        .optional()
        .describe("Filter by valence: positive (>0.3), negative (<-0.3), or neutral"),

      arousal: z.enum(["high", "medium", "low"])
        .optional()
        .describe("Filter by arousal level: high (>0.7), medium (0.3-0.7), or low (<0.3)"),

      limit: z.number().min(1).max(50).optional().default(10)
        .describe("Maximum results to return"),

      project: z.string().optional()
        .describe("Filter by project"),
    },
    async ({ query, emotion, valence, arousal, limit, project }) => {
      try {
        // Perform semantic search first
        const searchResults = await searchMemories(query, {
          limit: limit * 2,  // Get extra for filtering
          project,
        });

        // Convert to plain Memory[] for filtering (lose score property but keep memories)
        let filtered: Memory[] = searchResults as Memory[];

        // Filter out memories without emotional context if emotional filters specified
        const hasEmotionalFilters = emotion || valence || arousal;
        if (hasEmotionalFilters) {
          filtered = filtered.filter((m: Memory) => m.emotional_context !== undefined);
        }

        // Apply emotional filters
        if (emotion) {
          filtered = filterByEmotion(filtered, { emotion });
        }

        if (valence) {
          if (valence === "positive") {
            filtered = filterByEmotion(filtered, { minValence: 0.3 });
          } else if (valence === "negative") {
            filtered = filterByEmotion(filtered, { maxValence: -0.3 });
          } else {
            // neutral: -0.3 to 0.3
            filtered = filterByEmotion(filtered, { minValence: -0.3, maxValence: 0.3 });
          }
        }

        if (arousal) {
          if (arousal === "high") {
            filtered = filterByEmotion(filtered, { minArousal: 0.7 });
          } else if (arousal === "medium") {
            filtered = filterByEmotion(filtered, { minArousal: 0.3, maxArousal: 0.7 });
          } else {
            // low
            filtered = filterByEmotion(filtered, { maxArousal: 0.3 });
          }
        }

        // Limit results
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
          return toolResponse("No memories found matching emotional criteria.");
        }

        // Format output
        const sections: string[] = [];

        sections.push(formatHeader("EMOTIONAL RECALL RESULTS", 70));
        sections.push("");

        sections.push(`Query: "${query}"`);
        if (emotion) sections.push(`Emotion: ${emotion}`);
        if (valence) sections.push(`Valence: ${valence}`);
        if (arousal) sections.push(`Arousal: ${arousal}`);
        sections.push(`Found: ${results.length} memories`);
        sections.push("");
        sections.push(formatDivider(70));
        sections.push("");

        for (const memory of results) {
          const emotion = memory.emotional_context;
          const preview = memory.content.slice(0, 100) + (memory.content.length > 100 ? "..." : "");

          sections.push(`🧠 ${memory.id.slice(0, 12)}... [${memory.type}]`);
          sections.push(`   "${preview}"`);

          if (emotion) {
            sections.push(`   💭 Emotion: ${emotion.dominant_emotion || "unknown"}`);
            sections.push(`   📊 Valence: ${emotion.valence.toFixed(2)} | Arousal: ${emotion.arousal.toFixed(2)}`);

            if (emotion.secondary_emotions && emotion.secondary_emotions.length > 0) {
              const secondary = emotion.secondary_emotions
                .slice(0, 2)
                .map((e: { emotion: string; intensity: number; }) => `${e.emotion} (${(e.intensity * 100).toFixed(0)}%)`)
                .join(", ");
              sections.push(`   🎭 Secondary: ${secondary}`);
            }

            if (emotion.emotional_confidence !== undefined) {
              sections.push(`   ✓ Confidence: ${(emotion.emotional_confidence * 100).toFixed(0)}%`);
            }
          }

          sections.push(`   🏷️  Tags: ${memory.tags.join(", ") || "(none)"}`);
          sections.push(`   ⭐ Importance: ${memory.importance}/5`);
          sections.push("");
        }

        return toolResponse(sections.join("\n"));
      } catch (error) {
        console.error("Error in recall_emotional:", error);
        return toolResponse(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  /**
   * EMOTIONAL_TIMELINE - Track emotional evolution over time
   *
   * Shows how emotional context has evolved across memories,
   * useful for tracking sentiment changes in projects or topics.
   */
  server.tool(
    "emotional_timeline",
    {
      project: z.string().optional()
        .describe("Filter by project"),

      tag: z.string().optional()
        .describe("Filter by tag"),

      days: z.number().min(1).max(365).optional().default(30)
        .describe("Look back this many days"),

      apply_decay: z.boolean().optional().default(false)
        .describe("Apply emotional decay to show current emotional state"),
    },
    async ({ project, tag, days, apply_decay }) => {
      try {
        // Get all memories
        let memories = await listMemories({ project, sortBy: "recent" });

        // Filter by tag
        if (tag) {
          memories = memories.filter((m: Memory) => m.tags.includes(tag));
        }

        // Filter by time window
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        memories = memories.filter((m: Memory) => new Date(m.timestamp) >= cutoff);

        // Filter to only memories with emotional context
        const emotionalMemories = memories.filter((m: Memory) => m.emotional_context !== undefined);

        if (emotionalMemories.length === 0) {
          return toolResponse("No memories with emotional context found in the specified time range.");
        }

        // Sort by timestamp
        emotionalMemories.sort((a: Memory, b: Memory) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Calculate statistics
        let totalValence = 0;
        let totalArousal = 0;
        const emotionCounts: Record<string, number> = {};

        for (const memory of emotionalMemories) {
          const emotion = memory.emotional_context!;

          // Apply decay if requested
          let currentEmotion = emotion;
          if (apply_decay && emotion.emotional_timestamp) {
            const daysSince = daysSinceEmotionalCapture(emotion.emotional_timestamp);
            currentEmotion = applyEmotionalDecay(emotion, daysSince);
          }

          totalValence += currentEmotion.valence;
          totalArousal += currentEmotion.arousal;

          const dominantEmotion = currentEmotion.dominant_emotion || "unknown";
          emotionCounts[dominantEmotion] = (emotionCounts[dominantEmotion] || 0) + 1;
        }

        const avgValence = totalValence / emotionalMemories.length;
        const avgArousal = totalArousal / emotionalMemories.length;

        // Format output
        const sections: string[] = [];

        sections.push(formatHeader("EMOTIONAL TIMELINE", 70));
        sections.push("");

        if (project) sections.push(`Project: ${project}`);
        if (tag) sections.push(`Tag: ${tag}`);
        sections.push(`Period: Last ${days} days`);
        sections.push(`Memories: ${emotionalMemories.length} with emotional context`);
        if (apply_decay) sections.push(`Decay Applied: Yes (current emotional state)`);
        sections.push("");
        sections.push(formatDivider(70));
        sections.push("");

        // Overall statistics
        sections.push("📊 OVERALL EMOTIONAL PROFILE");
        sections.push("");
        sections.push(`Average Valence: ${avgValence.toFixed(2)} (${
          avgValence > 0.3 ? "positive ✓" :
          avgValence < -0.3 ? "negative ✗" :
          "neutral ~"
        })`);
        sections.push(`Average Arousal: ${avgArousal.toFixed(2)} (${
          avgArousal > 0.7 ? "high energy ⚡" :
          avgArousal < 0.3 ? "low energy 😌" :
          "medium energy ~"
        })`);
        sections.push("");

        // Emotion distribution
        sections.push("🎭 EMOTION DISTRIBUTION");
        sections.push("");
        const sortedEmotions = Object.entries(emotionCounts)
          .sort((a, b) => b[1] - a[1]);

        for (const [emotion, count] of sortedEmotions) {
          const percentage = ((count / emotionalMemories.length) * 100).toFixed(0);
          const bar = "█".repeat(Math.floor(count / emotionalMemories.length * 20));
          sections.push(`${emotion.padEnd(12)} ${bar} ${count} (${percentage}%)`);
        }
        sections.push("");
        sections.push(formatDivider(70));
        sections.push("");

        // Timeline (show first 10 entries chronologically)
        sections.push("📅 TIMELINE (Recent → Older)");
        sections.push("");

        const timelineEntries = emotionalMemories.slice(-10).reverse(); // Last 10, most recent first

        for (const memory of timelineEntries) {
          const emotion = memory.emotional_context!;
          const date = new Date(memory.timestamp).toLocaleDateString();
          const preview = memory.content.slice(0, 60) + (memory.content.length > 60 ? "..." : "");

          const valenceMark = emotion.valence > 0.3 ? "+" : emotion.valence < -0.3 ? "-" : "~";
          const arousalMark = emotion.arousal > 0.7 ? "⚡" : emotion.arousal < 0.3 ? "😌" : "~";

          sections.push(`${date} | ${valenceMark}${arousalMark} ${emotion.dominant_emotion || "?"}`);
          sections.push(`   "${preview}"`);
          sections.push("");
        }

        return toolResponse(sections.join("\n"));
      } catch (error) {
        console.error("Error in emotional_timeline:", error);
        return toolResponse(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  /**
   * EMOTIONAL_SHIFT_DETECTOR - Identify belief valence changes
   *
   * Detects memories where emotional context shifted significantly,
   * useful for tracking belief updates and learning experiences.
   */
  server.tool(
    "emotional_shift_detector",
    {
      project: z.string().optional()
        .describe("Filter by project"),

      min_magnitude: z.number().min(0).max(2).optional().default(0.4)
        .describe("Minimum shift magnitude to report (0-2)"),

      limit: z.number().min(1).max(50).optional().default(20)
        .describe("Maximum shifts to return"),
    },
    async ({ project, min_magnitude, limit }) => {
      try {
        // Get all memories
        let memories = await listMemories({ project, sortBy: "recent" });

        // Filter to only memories with emotional context
        const emotionalMemories = memories.filter((m: Memory) => m.emotional_context !== undefined);

        // Find memories that supersede others (belief updates)
        const shifts: Array<{
          oldMemory: Memory;
          newMemory: Memory;
          shift: { from: BasicEmotion; to: BasicEmotion; magnitude: number; };
        }> = [];

        for (const memory of emotionalMemories) {
          if (memory.supersedes) {
            const oldMemory = memories.find((m: Memory) => m.id === memory.supersedes);
            if (oldMemory?.emotional_context) {
              const shift = detectEmotionalShift(oldMemory, memory);
              if (shift && shift.magnitude >= min_magnitude) {
                shifts.push({ oldMemory, newMemory: memory, shift });
              }
            }
          }
        }

        // Also check related_memories for shifts (not just supersedes)
        for (const memory of emotionalMemories) {
          if (memory.related_memories && memory.related_memories.length > 0) {
            for (const relatedId of memory.related_memories) {
              const relatedMemory = memories.find((m: Memory) => m.id === relatedId);
              if (relatedMemory?.emotional_context) {
                const shift = detectEmotionalShift(relatedMemory, memory);
                if (shift && shift.magnitude >= min_magnitude) {
                  // Check if not already in shifts
                  const exists = shifts.some((s: { oldMemory: Memory; newMemory: Memory; shift: { from: BasicEmotion; to: BasicEmotion; magnitude: number; }; }) =>
                    s.oldMemory.id === relatedMemory.id && s.newMemory.id === memory.id
                  );
                  if (!exists) {
                    shifts.push({ oldMemory: relatedMemory, newMemory: memory, shift });
                  }
                }
              }
            }
          }
        }

        // Sort by magnitude (largest shifts first)
        shifts.sort((a, b) => b.shift.magnitude - a.shift.magnitude);

        // Limit results
        const results = shifts.slice(0, limit);

        if (results.length === 0) {
          return toolResponse(
            `No significant emotional shifts found (magnitude >= ${min_magnitude}).`
          );
        }

        // Format output
        const sections: string[] = [];

        sections.push(formatHeader("EMOTIONAL SHIFT DETECTION", 70));
        sections.push("");
        sections.push(`Found: ${results.length} significant emotional shifts`);
        sections.push(`Minimum Magnitude: ${min_magnitude.toFixed(2)}`);
        if (project) sections.push(`Project: ${project}`);
        sections.push("");
        sections.push(formatDivider(70));
        sections.push("");

        for (const { oldMemory, newMemory, shift } of results) {
          const oldDate = new Date(oldMemory.timestamp).toLocaleDateString();
          const newDate = new Date(newMemory.timestamp).toLocaleDateString();
          const oldPreview = oldMemory.content.slice(0, 80) + (oldMemory.content.length > 80 ? "..." : "");
          const newPreview = newMemory.content.slice(0, 80) + (newMemory.content.length > 80 ? "..." : "");

          sections.push(`🔄 SHIFT MAGNITUDE: ${shift.magnitude.toFixed(2)}`);
          sections.push(`   ${shift.from} → ${shift.to}`);
          sections.push("");

          sections.push(`📅 OLD (${oldDate}): ${oldMemory.id.slice(0, 12)}...`);
          sections.push(`   "${oldPreview}"`);
          const oldEmotion = oldMemory.emotional_context!;
          sections.push(`   💭 Valence: ${oldEmotion.valence.toFixed(2)} | Arousal: ${oldEmotion.arousal.toFixed(2)}`);
          sections.push("");

          sections.push(`📅 NEW (${newDate}): ${newMemory.id.slice(0, 12)}...`);
          sections.push(`   "${newPreview}"`);
          const newEmotion = newMemory.emotional_context!;
          sections.push(`   💭 Valence: ${newEmotion.valence.toFixed(2)} | Arousal: ${newEmotion.arousal.toFixed(2)}`);
          sections.push("");
          sections.push(formatDivider(70, "─"));
          sections.push("");
        }

        return toolResponse(sections.join("\n"));
      } catch (error) {
        console.error("Error in emotional_shift_detector:", error);
        return toolResponse(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  /**
   * INFER_EMOTION - Manually infer emotion from text
   *
   * Utility tool for testing and debugging emotional inference.
   * Shows detailed breakdown of sentiment analysis.
   */
  server.tool(
    "infer_emotion",
    {
      text: z.string()
        .describe("Text to analyze for emotional content"),

      explicit_emotion: z.enum(["joy", "sadness", "fear", "anger", "surprise", "disgust", "neutral"])
        .optional()
        .describe("Override automatic detection with explicit emotion"),
    },
    async ({ text, explicit_emotion }) => {
      try {
        const emotion = inferEmotionalContext(text, explicit_emotion);

        const sections: string[] = [];

        sections.push(formatHeader("EMOTIONAL INFERENCE", 70));
        sections.push("");
        sections.push(`Text: "${text.slice(0, 200)}${text.length > 200 ? "..." : ""}"`);
        sections.push("");
        sections.push(formatDivider(70));
        sections.push("");

        sections.push("📊 EMOTIONAL ANALYSIS");
        sections.push("");

        const data: Record<string, string> = {
          "Dominant Emotion": emotion.dominant_emotion || "unknown",
          "Valence": `${emotion.valence.toFixed(2)} (${
            emotion.valence > 0.3 ? "positive ✓" :
            emotion.valence < -0.3 ? "negative ✗" :
            "neutral ~"
          })`,
          "Arousal": `${emotion.arousal.toFixed(2)} (${
            emotion.arousal > 0.7 ? "high ⚡" :
            emotion.arousal < 0.3 ? "low 😌" :
            "medium ~"
          })`,
          "Confidence": `${((emotion.emotional_confidence || 0) * 100).toFixed(0)}%`,
          "Detected By": emotion.detected_by || "inferred",
        };

        sections.push(formatTable(data));
        sections.push("");

        if (emotion.secondary_emotions && emotion.secondary_emotions.length > 0) {
          sections.push("🎭 SECONDARY EMOTIONS");
          sections.push("");
          for (const secondary of emotion.secondary_emotions) {
            const intensity = (secondary.intensity * 100).toFixed(0);
            sections.push(`   ${secondary.emotion}: ${intensity}%`);
          }
          sections.push("");
        }

        // Visual representation (Russell's Circumplex)
        sections.push("📍 RUSSELL'S CIRCUMPLEX POSITION");
        sections.push("");
        sections.push("     High Arousal (1.0)");
        sections.push("            ▲");
        sections.push("            │");
        sections.push("  Negative  │  Positive");
        sections.push("  (-1.0) ───┼─── (+1.0)");
        sections.push("            │");
        sections.push("            ▼");
        sections.push("     Low Arousal (0.0)");
        sections.push("");
        sections.push(`Position: Valence=${emotion.valence.toFixed(2)}, Arousal=${emotion.arousal.toFixed(2)}`);

        return toolResponse(sections.join("\n"));
      } catch (error) {
        console.error("Error in infer_emotion:", error);
        return toolResponse(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
