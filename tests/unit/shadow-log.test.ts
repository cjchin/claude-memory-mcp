/**
 * Tests for the Shadow Log Module
 *
 * Tests activity recording, topic inference, promotion thresholds,
 * shadow status management, and decay/cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initShadowLog,
  recordActivity,
  getShadowEntry,
  getShadowById,
  listActiveShadows,
  getSessionShadows,
  checkPromotionThresholds,
  markShadowPromoted,
  getRecentlyPromoted,
  generateShadowSummary,
  decayOldShadows,
  finalizeShadow,
  inferTopic,
  estimateTokens,
  getActiveMinutes,
  getShadowStats,
  clearShadowLog,
  createActivity,
  exportShadowStore,
} from "../../src/shadow-log.js";
import type { ShadowActivity, ShadowEntry } from "../../src/types.js";

// Test session ID
const TEST_SESSION = "test_session_123";

describe("shadow-log.ts", () => {
  // Clean up before each test
  beforeEach(() => {
    clearShadowLog();
  });

  afterEach(() => {
    clearShadowLog();
  });

  describe("initShadowLog", () => {
    it("should initialize without error", () => {
      expect(() => initShadowLog()).not.toThrow();
    });
  });

  describe("estimateTokens", () => {
    it("should estimate ~4 chars per token", () => {
      expect(estimateTokens("test")).toBe(1);
      expect(estimateTokens("hello world")).toBe(3);
      expect(estimateTokens("a".repeat(100))).toBe(25);
    });

    it("should round up", () => {
      expect(estimateTokens("abc")).toBe(1); // 3/4 = 0.75 -> 1
      expect(estimateTokens("abcde")).toBe(2); // 5/4 = 1.25 -> 2
    });
  });

  describe("createActivity", () => {
    it("should create an activity with timestamp", () => {
      const activity = createActivity("file_read", "/src/index.ts");

      expect(activity.type).toBe("file_read");
      expect(activity.detail).toBe("/src/index.ts");
      expect(activity.timestamp).toBeDefined();
      expect(activity.tokens).toBeGreaterThan(0);
    });

    it("should use provided tokens if given", () => {
      const activity = createActivity("search", "test query", 50);
      expect(activity.tokens).toBe(50);
    });
  });

  describe("inferTopic", () => {
    it("should infer topic from file paths", () => {
      const activities: ShadowActivity[] = [
        createActivity("file_read", "/src/auth/login.ts"),
        createActivity("file_read", "/src/auth/logout.ts"),
      ];

      expect(inferTopic(activities)).toBe("auth");
    });

    it("should use tag detection for keywords", () => {
      const activities: ShadowActivity[] = [
        createActivity("search", "database connection pool"),
      ];

      expect(inferTopic(activities)).toBe("database");
    });

    it("should return 'general' for unclear topics", () => {
      const activities: ShadowActivity[] = [
        createActivity("tool_use", "ls"),
      ];

      expect(inferTopic(activities)).toBe("general");
    });
  });

  describe("recordActivity", () => {
    it("should create a new shadow entry", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      expect(shadow).toBeDefined();
      expect(shadow.session_id).toBe(TEST_SESSION);
      expect(shadow.status).toBe("active");
      expect(shadow.activities).toHaveLength(1);
    });

    it("should accumulate activities in same topic", () => {
      const activity1 = createActivity("file_read", "/src/auth/login.ts");
      const activity2 = createActivity("file_read", "/src/auth/logout.ts");

      recordActivity(TEST_SESSION, activity1, "auth");
      const shadow = recordActivity(TEST_SESSION, activity2, "auth");

      expect(shadow.activities).toHaveLength(2);
      expect(shadow.tokens).toBeGreaterThan(0);
    });

    it("should create separate shadows for different topics", () => {
      const activity1 = createActivity("file_read", "/src/auth/login.ts");
      const activity2 = createActivity("file_read", "/src/db/query.ts");

      recordActivity(TEST_SESSION, activity1, "auth");
      recordActivity(TEST_SESSION, activity2, "database");

      const shadows = getSessionShadows(TEST_SESSION);
      expect(shadows.length).toBe(2);
    });

    it("should accumulate tokens correctly", () => {
      const activity1 = createActivity("file_read", "a".repeat(40), 10);
      const activity2 = createActivity("search", "test query", 5);

      recordActivity(TEST_SESSION, activity1, "test");
      const shadow = recordActivity(TEST_SESSION, activity2, "test");

      expect(shadow.tokens).toBe(15);
    });
  });

  describe("getShadowEntry", () => {
    it("should return null for non-existent session", () => {
      const result = getShadowEntry("non_existent");
      expect(result).toBeNull();
    });

    it("should return active shadow for session", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      recordActivity(TEST_SESSION, activity);

      const shadow = getShadowEntry(TEST_SESSION);
      expect(shadow).not.toBeNull();
      expect(shadow?.session_id).toBe(TEST_SESSION);
    });

    it("should filter by topic when provided", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test"), "auth");
      recordActivity(TEST_SESSION, createActivity("file_read", "test"), "database");

      const authShadow = getShadowEntry(TEST_SESSION, "auth");
      expect(authShadow?.topic).toBe("auth");

      const dbShadow = getShadowEntry(TEST_SESSION, "database");
      expect(dbShadow?.topic).toBe("database");
    });
  });

  describe("getShadowById", () => {
    it("should return shadow by ID", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const created = recordActivity(TEST_SESSION, activity);

      const found = getShadowById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it("should return null for non-existent ID", () => {
      expect(getShadowById("non_existent_id")).toBeNull();
    });
  });

  describe("listActiveShadows", () => {
    it("should return empty array when no shadows", () => {
      const shadows = listActiveShadows();
      expect(shadows).toHaveLength(0);
    });

    it("should return active shadows across sessions", () => {
      recordActivity("session1", createActivity("file_read", "test"), "topic1");
      recordActivity("session2", createActivity("file_read", "test"), "topic2");

      const shadows = listActiveShadows();
      expect(shadows.length).toBe(2);
    });

    it("should sort by last activity (most recent first)", () => {
      recordActivity("session1", createActivity("file_read", "test"), "older");

      // Small delay to ensure different timestamps
      const olderShadow = getShadowEntry("session1");

      recordActivity("session2", createActivity("file_read", "test"), "newer");

      const shadows = listActiveShadows();
      expect(shadows[0].topic).toBe("newer");
    });
  });

  describe("checkPromotionThresholds", () => {
    it("should return empty when no candidates", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test", 10));

      const candidates = checkPromotionThresholds();
      expect(candidates).toHaveLength(0);
    });

    it("should identify candidates above token threshold", () => {
      // Record many activities to exceed token threshold (default 500)
      for (let i = 0; i < 60; i++) {
        recordActivity(TEST_SESSION, createActivity("file_read", "x".repeat(40), 10), "test");
      }

      const candidates = checkPromotionThresholds();
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates[0].tokens).toBeGreaterThanOrEqual(500);
    });
  });

  describe("markShadowPromoted", () => {
    it("should mark shadow as promoted", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      markShadowPromoted(shadow.id, "mem_123");

      const updated = getShadowById(shadow.id);
      expect(updated?.status).toBe("promoted");
      expect(updated?.promoted_memory_id).toBe("mem_123");
    });

    it("should add to recently promoted list", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      markShadowPromoted(shadow.id, "mem_456");

      const recent = getRecentlyPromoted();
      expect(recent.length).toBe(1);
      expect(recent[0].memory_id).toBe("mem_456");
      expect(recent[0].shadow_id).toBe(shadow.id);
    });
  });

  describe("generateShadowSummary", () => {
    it("should generate meaningful summary", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "/src/auth/login.ts"), "auth");
      recordActivity(TEST_SESSION, createActivity("file_read", "/src/auth/logout.ts"), "auth");
      recordActivity(TEST_SESSION, createActivity("search", "handleAuth"), "auth");

      const shadow = getShadowEntry(TEST_SESSION, "auth")!;
      const summary = generateShadowSummary(shadow);

      expect(summary).toContain("auth");
      expect(summary).toContain("file reads");
      expect(summary).toContain("tokens");
    });

    it("should include activity counts", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test1"), "test");
      recordActivity(TEST_SESSION, createActivity("file_read", "test2"), "test");
      recordActivity(TEST_SESSION, createActivity("search", "query"), "test");

      const shadow = getShadowEntry(TEST_SESSION, "test")!;
      const summary = generateShadowSummary(shadow);

      expect(summary).toContain("2 file reads");
      expect(summary).toContain("1 search");
    });
  });

  describe("finalizeShadow", () => {
    it("should mark active shadow as idle", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      finalizeShadow(shadow.id);

      const updated = getShadowById(shadow.id);
      expect(updated?.status).toBe("idle");
      expect(updated?.summary).toBeDefined();
    });

    it("should not change already idle shadow", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      finalizeShadow(shadow.id);
      const firstSummary = getShadowById(shadow.id)?.summary;

      finalizeShadow(shadow.id);
      const secondSummary = getShadowById(shadow.id)?.summary;

      expect(firstSummary).toBe(secondSummary);
    });
  });

  describe("getActiveMinutes", () => {
    it("should calculate minutes between creation and last activity", () => {
      const activity = createActivity("file_read", "/src/index.ts");
      const shadow = recordActivity(TEST_SESSION, activity);

      const minutes = getActiveMinutes(shadow);
      // Should be close to 0 for a just-created shadow
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThan(1);
    });
  });

  describe("getShadowStats", () => {
    it("should return stats with all zeros initially", () => {
      const stats = getShadowStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.idle).toBe(0);
      expect(stats.promoted).toBe(0);
      expect(stats.decayed).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });

    it("should track active shadows", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test", 100), "test");

      const stats = getShadowStats();
      expect(stats.total).toBe(1);
      expect(stats.active).toBe(1);
      expect(stats.totalTokens).toBe(100);
    });

    it("should track promoted shadows", () => {
      const shadow = recordActivity(TEST_SESSION, createActivity("file_read", "test"), "test");
      markShadowPromoted(shadow.id, "mem_123");

      const stats = getShadowStats();
      expect(stats.promoted).toBe(1);
      expect(stats.active).toBe(0);
    });
  });

  describe("decayOldShadows", () => {
    it("should not decay recent shadows", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test"), "test");

      const decayedCount = decayOldShadows();
      expect(decayedCount).toBe(0);

      const stats = getShadowStats();
      expect(stats.active).toBe(1);
    });

    // Note: Testing actual decay would require mocking time
    // The function uses config.shadow_decay_hours (default 24)
  });

  describe("clearShadowLog", () => {
    it("should clear all shadows", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test"), "test");

      expect(getShadowStats().total).toBe(1);

      clearShadowLog();

      expect(getShadowStats().total).toBe(0);
    });
  });

  describe("exportShadowStore", () => {
    it("should return the entire store", () => {
      recordActivity(TEST_SESSION, createActivity("file_read", "test"), "test");

      const store = exportShadowStore();

      expect(store.version).toBe(1);
      expect(store.entries).toHaveLength(1);
      expect(store.recently_promoted).toHaveLength(0);
    });
  });

  describe("multi-session behavior", () => {
    it("should track shadows from multiple sessions independently", () => {
      recordActivity("session_a", createActivity("file_read", "auth"), "auth");
      recordActivity("session_b", createActivity("file_read", "db"), "database");

      const sessionAShadows = getSessionShadows("session_a");
      const sessionBShadows = getSessionShadows("session_b");

      expect(sessionAShadows).toHaveLength(1);
      expect(sessionAShadows[0].topic).toBe("auth");

      expect(sessionBShadows).toHaveLength(1);
      expect(sessionBShadows[0].topic).toBe("database");
    });

    it("should list all active shadows across sessions", () => {
      recordActivity("session_a", createActivity("file_read", "test"), "topic1");
      recordActivity("session_b", createActivity("file_read", "test"), "topic2");
      recordActivity("session_c", createActivity("file_read", "test"), "topic3");

      const allShadows = listActiveShadows();
      expect(allShadows).toHaveLength(3);

      const sessionIds = allShadows.map((s) => s.session_id);
      expect(sessionIds).toContain("session_a");
      expect(sessionIds).toContain("session_b");
      expect(sessionIds).toContain("session_c");
    });
  });
});
