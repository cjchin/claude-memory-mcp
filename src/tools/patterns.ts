/**
 * Common Patterns - Reusable utility patterns for tool implementations
 *
 * Extracts frequently duplicated code patterns into shared utilities.
 */

import type { Memory, ShadowEntry, ShadowActivity } from "../types.js";
import { config } from "../config.js";

/**
 * Calculate promotion progress for a shadow
 *
 * Returns percentage progress toward promotion threshold based on
 * both token count and active time.
 *
 * @param shadow - Shadow entry to calculate progress for
 * @returns Object with token progress, time progress, and max progress percentages
 *
 * @example
 * ```typescript
 * const progress = calculatePromotionProgress(shadow);
 * if (progress.maxProgress >= 100) {
 *   // Ready for promotion
 * }
 * ```
 */
export function calculatePromotionProgress(shadow: ShadowEntry): {
  tokenProgress: number;
  timeProgress: number;
  maxProgress: number;
} {
  const tokenProgress = (shadow.tokens / config.shadow_token_threshold) * 100;

  // Calculate active time in minutes
  const firstActivity = Math.min(...shadow.activities.map((a: ShadowActivity) => new Date(a.timestamp).getTime()));
  const lastActivity = Math.max(...shadow.activities.map((a: ShadowActivity) => new Date(a.timestamp).getTime()));
  const activeMinutes = (lastActivity - firstActivity) / (1000 * 60);
  const timeProgress = (activeMinutes / config.shadow_time_threshold_min) * 100;

  const maxProgress = Math.max(tokenProgress, timeProgress);

  return {
    tokenProgress,
    timeProgress,
    maxProgress,
  };
}

/**
 * Filter memories by project
 *
 * Handles the common pattern of optionally filtering memories by project name.
 *
 * @param memories - Array of memories to filter
 * @param project - Optional project name (undefined = no filtering)
 * @returns Filtered array of memories
 *
 * @example
 * ```typescript
 * const filtered = filterMemoriesByProject(allMemories, "my-project");
 * const all = filterMemoriesByProject(allMemories, undefined); // No filtering
 * ```
 */
export function filterMemoriesByProject(
  memories: Memory[],
  project?: string
): Memory[] {
  if (!project) {
    return memories;
  }
  return memories.filter(m => m.project === project);
}

/**
 * Paginate results with limit and offset
 *
 * Handles the common pattern of limiting and paginating result sets.
 *
 * @param items - Array of items to paginate
 * @param limit - Maximum number of items to return
 * @param offset - Number of items to skip (default: 0)
 * @returns Sliced array of items
 *
 * @example
 * ```typescript
 * const page1 = paginateResults(items, 10, 0);   // First 10
 * const page2 = paginateResults(items, 10, 10);  // Next 10
 * ```
 */
export function paginateResults<T>(
  items: T[],
  limit: number,
  offset: number = 0
): T[] {
  return items.slice(offset, offset + limit);
}

/**
 * Format tool output with consistent structure
 *
 * Handles the common pattern of building tool output from sections
 * with a title and optional emoji.
 *
 * @param sections - Array of text sections to join
 * @param title - Optional title for the output
 * @param emoji - Optional emoji prefix for title
 * @returns Formatted text suitable for tool response
 *
 * @example
 * ```typescript
 * const sections = [
 *   "Section 1 content",
 *   "Section 2 content",
 * ];
 * const text = formatToolOutput(sections, "REPORT", "📊");
 * // Returns:
 * // 📊 REPORT
 * // ═══════════
 * // Section 1 content
 * // Section 2 content
 * ```
 */
export function formatToolOutput(
  sections: string[],
  title?: string,
  emoji?: string
): string {
  const output: string[] = [];

  if (title) {
    const header = emoji ? `${emoji} ${title}` : title;
    output.push(header);
    output.push("═".repeat(Math.min(header.length, 60)));
    output.push("");
  }

  output.push(...sections);

  return output.join("\n");
}

/**
 * Calculate active time for a shadow in minutes
 *
 * @param shadow - Shadow entry
 * @returns Active time in minutes (rounded)
 */
export function getActiveMinutes(shadow: ShadowEntry): number {
  if (shadow.activities.length === 0) {
    return 0;
  }

  const firstActivity = Math.min(...shadow.activities.map((a: ShadowActivity) => new Date(a.timestamp).getTime()));
  const lastActivity = Math.max(...shadow.activities.map((a: ShadowActivity) => new Date(a.timestamp).getTime()));
  const activeMs = lastActivity - firstActivity;

  return Math.round(activeMs / (1000 * 60));
}

/**
 * Build standard MCP tool response
 *
 * Helper to create properly typed tool responses.
 *
 * @param text - Response text
 * @returns Formatted tool response object
 */
export function toolResponse(text: string) {
  return {
    content: [{
      type: "text" as const,
      text,
    }],
  };
}

/**
 * Validate that a memory ID exists in a list
 *
 * Common validation pattern for memory operations.
 *
 * @param id - Memory ID to validate
 * @param memories - List of available memories
 * @returns True if found, false otherwise
 */
export function validateMemoryId(id: string, memories: Memory[]): boolean {
  return memories.some(m => m.id === id);
}

/**
 * Get the best (highest importance) memory from a list
 *
 * @param memories - Array of memories
 * @returns Memory with highest importance
 */
export function getBestMemory(memories: Memory[]): Memory {
  return memories.reduce((best, current) =>
    current.importance > best.importance ? current : best
  );
}

/**
 * Format memory preview for display
 *
 * Truncates content and formats metadata for human-readable output.
 *
 * @param memory - Memory to format
 * @param maxLength - Maximum content length (default: 50)
 * @returns Formatted string
 */
export function formatMemoryPreview(memory: Memory, maxLength: number = 50): string {
  const content = memory.content.length > maxLength
    ? memory.content.slice(0, maxLength) + "..."
    : memory.content;

  return `[${memory.id.slice(0, 12)}...] (${memory.type}) "${content}"`;
}
