/**
 * Unit tests for session state management
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ReviewSession,
  getReviewSession,
  deleteReviewSession,
  getAllSessions,
  cleanupStaleSessions,
  getSessionStats,
  clearAllSessions,
} from "../../src/tools/state.js";

describe("Session State Management", () => {
  beforeEach(() => {
    // Clear all sessions before each test
    clearAllSessions();
  });

  describe("ReviewSession", () => {
    it("should initialize with correct defaults", () => {
      const session = new ReviewSession("test-session");

      expect(session.sessionId).toBe("test-session");
      expect(session.contradictions).toEqual([]);
      expect(session.consolidations).toEqual([]);
      expect(session.currentContradictionIndex).toBe(0);
      expect(session.currentConsolidationIndex).toBe(0);
      expect(session.initialized).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
    });

    it("should update lastActivity on touch", () => {
      const session = new ReviewSession("test");
      const originalActivity = session.lastActivity;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      session.touch();

      expect(session.lastActivity.getTime()).toBeGreaterThan(
        originalActivity.getTime()
      );

      vi.useRealTimers();
    });

    it("should detect stale sessions", () => {
      const session = new ReviewSession("test");

      expect(session.isStale()).toBe(false);

      // Simulate time passing (> 1 hour)
      vi.useFakeTimers();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      session.lastActivity = twoHoursAgo;

      expect(session.isStale()).toBe(true);

      vi.useRealTimers();
    });

    it("should reset session state", () => {
      const session = new ReviewSession("test");

      // Populate with data
      session.contradictions = [{ confidence: 0.9 } as any];
      session.consolidations = [{ similarity: 0.85 } as any];
      session.currentContradictionIndex = 5;
      session.currentConsolidationIndex = 3;
      session.initialized = true;

      // Reset
      session.reset();

      expect(session.contradictions).toEqual([]);
      expect(session.consolidations).toEqual([]);
      expect(session.currentContradictionIndex).toBe(0);
      expect(session.currentConsolidationIndex).toBe(0);
      expect(session.initialized).toBe(false);
    });
  });

  describe("getReviewSession", () => {
    it("should create new session if not exists", () => {
      const session = getReviewSession("new-session");

      expect(session).toBeInstanceOf(ReviewSession);
      expect(session.sessionId).toBe("new-session");
    });

    it("should return existing session", () => {
      const session1 = getReviewSession("existing");
      const session2 = getReviewSession("existing");

      expect(session1).toBe(session2);
    });

    it("should touch session on access", () => {
      const session = getReviewSession("touch-test");
      const originalActivity = session.lastActivity;

      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      const accessedSession = getReviewSession("touch-test");

      expect(accessedSession.lastActivity.getTime()).toBeGreaterThan(
        originalActivity.getTime()
      );

      vi.useRealTimers();
    });

    it("should handle multiple concurrent sessions", () => {
      const session1 = getReviewSession("session-1");
      const session2 = getReviewSession("session-2");
      const session3 = getReviewSession("session-3");

      expect(session1.sessionId).toBe("session-1");
      expect(session2.sessionId).toBe("session-2");
      expect(session3.sessionId).toBe("session-3");
      expect(getAllSessions()).toHaveLength(3);
    });
  });

  describe("deleteReviewSession", () => {
    it("should delete existing session", () => {
      getReviewSession("to-delete");
      expect(getAllSessions()).toHaveLength(1);

      const deleted = deleteReviewSession("to-delete");

      expect(deleted).toBe(true);
      expect(getAllSessions()).toHaveLength(0);
    });

    it("should return false for non-existent session", () => {
      const deleted = deleteReviewSession("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("getAllSessions", () => {
    it("should return empty array when no sessions", () => {
      expect(getAllSessions()).toEqual([]);
    });

    it("should return all active sessions", () => {
      getReviewSession("s1");
      getReviewSession("s2");
      getReviewSession("s3");

      const sessions = getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId)).toContain("s1");
      expect(sessions.map((s) => s.sessionId)).toContain("s2");
      expect(sessions.map((s) => s.sessionId)).toContain("s3");
    });
  });

  describe("cleanupStaleSessions", () => {
    it("should not clean up fresh sessions", () => {
      getReviewSession("fresh");

      const cleaned = cleanupStaleSessions();

      expect(cleaned).toBe(0);
      expect(getAllSessions()).toHaveLength(1);
    });

    it("should clean up stale sessions", () => {
      vi.useFakeTimers();

      const session = getReviewSession("stale");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      session.lastActivity = twoHoursAgo;

      getReviewSession("fresh");

      const cleaned = cleanupStaleSessions();

      expect(cleaned).toBe(1);
      expect(getAllSessions()).toHaveLength(1);
      expect(getAllSessions()[0].sessionId).toBe("fresh");

      vi.useRealTimers();
    });

    it("should handle multiple stale sessions", () => {
      vi.useFakeTimers();

      const session1 = getReviewSession("stale1");
      const session2 = getReviewSession("stale2");
      const session3 = getReviewSession("fresh");

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      session1.lastActivity = twoHoursAgo;
      session2.lastActivity = twoHoursAgo;

      const cleaned = cleanupStaleSessions();

      expect(cleaned).toBe(2);
      expect(getAllSessions()).toHaveLength(1);

      vi.useRealTimers();
    });
  });

  describe("getSessionStats", () => {
    it("should return correct stats for empty sessions", () => {
      const stats = getSessionStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.stale).toBe(0);
      expect(stats.memoryEstimateKB).toBe(0);
    });

    it("should count active sessions correctly", () => {
      getReviewSession("s1");
      getReviewSession("s2");
      getReviewSession("s3");

      const stats = getSessionStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(3);
      expect(stats.stale).toBe(0);
      expect(stats.memoryEstimateKB).toBe(3);
    });

    it("should separate active and stale sessions", () => {
      vi.useFakeTimers();

      const staleSession = getReviewSession("stale");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      staleSession.lastActivity = twoHoursAgo;

      getReviewSession("active1");
      getReviewSession("active2");

      const stats = getSessionStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(2);
      expect(stats.stale).toBe(1);

      vi.useRealTimers();
    });
  });

  describe("clearAllSessions", () => {
    it("should remove all sessions", () => {
      getReviewSession("s1");
      getReviewSession("s2");
      getReviewSession("s3");

      expect(getAllSessions()).toHaveLength(3);

      clearAllSessions();

      expect(getAllSessions()).toHaveLength(0);
    });
  });
});
