/**
 * Deduplication Service
 *
 * Centralized logic for checking and preventing duplicate memories.
 * Provides named threshold constants for consistent behavior across tools.
 */

import { findSimilarMemories } from "./db.js";
import type { Memory } from "./types.js";

/**
 * Named deduplication thresholds for different use cases
 * Higher values = stricter matching (must be more similar)
 * Lower values = looser matching (catches more potential duplicates)
 */
export const DEDUPE_THRESHOLDS = {
  /**
   * STRICT (0.9): For explicit memory saving (remember tool)
   * Only blocks near-perfect duplicates
   */
  STRICT: 0.9,

  /**
   * STANDARD (0.85): For automatic saving (conclude, synthesize)
   * Catches very similar memories
   */
  STANDARD: 0.85,

  /**
   * LOOSE (0.7): For general duplicate detection (find_similar default)
   * Catches somewhat similar memories
   */
  LOOSE: 0.7,

  /**
   * AUTOMATIC (0.8): For general use cases
   * Balanced between strict and loose
   */
  AUTOMATIC: 0.8,
} as const;

/**
 * Threshold keys for type safety
 */
export type DedupeThresholdKey = keyof typeof DEDUPE_THRESHOLDS;

/**
 * Check for duplicate memories using named threshold
 *
 * @param content - Content to check for duplicates
 * @param threshold - Named threshold key (default: STANDARD)
 * @returns Array of similar memories, empty if no duplicates found
 *
 * @example
 * ```typescript
 * // Check with standard threshold
 * const dupes = await checkDuplicates("User prefers TypeScript");
 *
 * // Check with strict threshold (fewer matches)
 * const dupes = await checkDuplicates("User prefers TypeScript", "STRICT");
 *
 * // Check with loose threshold (more matches)
 * const dupes = await checkDuplicates("User prefers TypeScript", "LOOSE");
 * ```
 */
export async function checkDuplicates(
  content: string,
  threshold: DedupeThresholdKey = "STANDARD"
): Promise<Memory[]> {
  const thresholdValue = DEDUPE_THRESHOLDS[threshold];
  return findSimilarMemories(content, thresholdValue);
}

/**
 * Check if content has duplicates (boolean version)
 *
 * @param content - Content to check for duplicates
 * @param threshold - Named threshold key (default: STANDARD)
 * @returns true if duplicates found, false otherwise
 */
export async function hasDuplicates(
  content: string,
  threshold: DedupeThresholdKey = "STANDARD"
): Promise<boolean> {
  const dupes = await checkDuplicates(content, threshold);
  return dupes.length > 0;
}

/**
 * Get threshold value by name (for backwards compatibility)
 *
 * @param threshold - Named threshold key
 * @returns Numeric threshold value
 */
export function getThresholdValue(threshold: DedupeThresholdKey): number {
  return DEDUPE_THRESHOLDS[threshold];
}
