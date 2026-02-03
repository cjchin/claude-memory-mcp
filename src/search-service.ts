/**
 * Search Service
 *
 * Centralized search abstraction for consistent query handling across tools.
 * Provides unified parameter normalization and project fallback logic.
 */

import { searchMemories } from "./db.js";
import { config } from "./config.js";
import type { MemoryType } from "./types.js";

/**
 * Search options with sensible defaults
 */
export interface SearchOptions {
  /** Project to search within (defaults to current_project) */
  project?: string;

  /** Memory types to filter by */
  types?: MemoryType[];

  /** Tags to filter by */
  tags?: string[];

  /** Maximum results to return */
  limit?: number;

  /** Minimum importance level (1-5) */
  minImportance?: number;
}

/**
 * Search memories with consistent defaults and project fallback
 *
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of matching memories with similarity scores
 *
 * @example
 * ```typescript
 * // Basic search (uses current project)
 * const results = await searchWithContext("authentication");
 *
 * // Search with filters
 * const results = await searchWithContext("database", {
 *   types: ["decision", "pattern"],
 *   minImportance: 4,
 *   limit: 10
 * });
 *
 * // Search across all projects
 * const results = await searchWithContext("typescript", {
 *   project: undefined
 * });
 * ```
 */
export async function searchWithContext(
  query: string,
  options: SearchOptions = {}
) {
  // Normalize project: use provided value, fallback to current_project, or undefined for all projects
  const project = "project" in options
    ? options.project
    : (config.current_project || undefined);

  // Apply defaults
  const limit = options.limit ?? 5;
  const minImportance = options.minImportance;
  const types = options.types;
  const tags = options.tags;

  // Call underlying searchMemories with normalized parameters
  return searchMemories(query, {
    limit,
    project,
    types,
    tags,
    minImportance,
  });
}

/**
 * Search within current project only (convenience function)
 *
 * @param query - Search query text
 * @param limit - Maximum results (default: 5)
 * @returns Array of matching memories
 */
export async function searchCurrentProject(
  query: string,
  limit: number = 5
) {
  const project = config.current_project;

  if (!project) {
    throw new Error("No current project set. Use searchWithContext with project parameter.");
  }

  return searchMemories(query, { limit, project });
}

/**
 * Search across all projects (convenience function)
 *
 * @param query - Search query text
 * @param limit - Maximum results (default: 10)
 * @returns Array of matching memories
 */
export async function searchAllProjects(
  query: string,
  limit: number = 10
) {
  return searchMemories(query, { limit, project: undefined });
}
