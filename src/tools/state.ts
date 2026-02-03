/**
 * State Management for MCP Tools
 *
 * Provides session-scoped state management for stateful operations like
 * conscious review of contradictions and consolidations.
 *
 * **Note**: State is stored in-memory and will be lost on server restart.
 * For production use, consider persisting to disk or database.
 */

import type { ContradictionCandidate, ConsolidationCandidate } from "../dream.js";

/**
 * Session-scoped review state
 *
 * Tracks progress through contradiction and consolidation review queues
 * for a specific session.
 */
export class ReviewSession {
  /** Session identifier */
  sessionId: string;

  /** Queue of contradictions to review */
  contradictions: ContradictionCandidate[] = [];

  /** Queue of consolidations to review */
  consolidations: ConsolidationCandidate[] = [];

  /** Current index in contradictions queue */
  currentContradictionIndex: number = 0;

  /** Current index in consolidations queue */
  currentConsolidationIndex: number = 0;

  /** Whether the session has been initialized */
  initialized: boolean = false;

  /** When this session was created */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivity: Date;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.createdAt = new Date();
    this.lastActivity = new Date();
  }

  /**
   * Update last activity timestamp
   */
  touch() {
    this.lastActivity = new Date();
  }

  /**
   * Check if session is stale (no activity for > 1 hour)
   */
  isStale(): boolean {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return this.lastActivity.getTime() < oneHourAgo;
  }

  /**
   * Reset review state
   */
  reset() {
    this.contradictions = [];
    this.consolidations = [];
    this.currentContradictionIndex = 0;
    this.currentConsolidationIndex = 0;
    this.initialized = false;
  }
}

/**
 * In-memory session store
 */
const sessions = new Map<string, ReviewSession>();

/**
 * Get or create a review session for a session ID
 *
 * @param sessionId - Session identifier
 * @returns ReviewSession instance
 */
export function getReviewSession(sessionId: string): ReviewSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new ReviewSession(sessionId));
  }

  const session = sessions.get(sessionId)!;
  session.touch();
  return session;
}

/**
 * Delete a review session
 *
 * @param sessionId - Session identifier
 * @returns true if session existed and was deleted
 */
export function deleteReviewSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Get all active sessions
 *
 * @returns Array of all ReviewSession instances
 */
export function getAllSessions(): ReviewSession[] {
  return Array.from(sessions.values());
}

/**
 * Clean up stale sessions (no activity for > 1 hour)
 *
 * Should be called periodically to prevent memory leaks.
 *
 * @returns Number of sessions cleaned up
 */
export function cleanupStaleSessions(): number {
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (session.isStale()) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Get session statistics
 *
 * @returns Object with session counts and memory usage estimates
 */
export function getSessionStats() {
  const allSessions = getAllSessions();
  const activeSessions = allSessions.filter(s => !s.isStale());
  const staleSessions = allSessions.filter(s => s.isStale());

  // Rough memory estimate (each session ~1KB)
  const memoryEstimateKB = allSessions.length;

  return {
    total: allSessions.length,
    active: activeSessions.length,
    stale: staleSessions.length,
    memoryEstimateKB,
  };
}

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions() {
  sessions.clear();
}

// Auto-cleanup every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cleaned = cleanupStaleSessions();
    if (cleaned > 0) {
      console.log(`[State] Cleaned up ${cleaned} stale review sessions`);
    }
  }, 10 * 60 * 1000);
}
