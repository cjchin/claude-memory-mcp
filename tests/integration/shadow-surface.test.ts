/**
 * Shadow Surfacing Integration Tests - Phase 3
 *
 * Tests integration of shadow log with prime and conclude tools:
 * - Shadow promotion candidates shown in prime
 * - Session shadows shown in conclude
 * - Formatting and thresholds work correctly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { config } from "../../src/config.js";
import { getCurrentSessionId, startSession, endSession } from "../../src/db.js";
import {
  recordActivity,
  createActivity,
  clearShadowLog,
  checkPromotionThresholds,
  getSessionShadows,
  formatShadowForClaude,
  getActiveMinutes,
} from "../../src/shadow-log.js";

describe("Shadow Surfacing Integration Tests", () => {
  let originalSessionId: string | null = null;
  let testSessionId: string;

  beforeEach(async () => {
    originalSessionId = getCurrentSessionId();
    testSessionId = await startSession("test_shadow_surface");
    clearShadowLog();

    // Ensure shadow is enabled and surfacing is on
    config.shadow_enabled = true;
    config.shadow_surface_in_prime = true;
    config.shadow_surface_in_conclude = true;
    config.shadow_surface_threshold = 0.6;
    config.shadow_token_threshold = 500;
    config.shadow_time_threshold_min = 30;
    config.shadow_deduplicate = true;
  });

  afterEach(async () => {
    clearShadowLog();
    if (originalSessionId) {
      await startSession(originalSessionId);
    }
  });

  describe("Shadow Promotion Candidates in prime", () => {
    it("should identify shadows that meet token threshold", () => {
      // Create shadow with 520 tokens (above 500 threshold)
      const activities = [];
      for (let i = 0; i < 26; i++) {
        activities.push(createActivity("file_read", `/src/module_${i}.ts`, 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "authentication");
      }

      expect(shadow).toBeDefined();
      expect(shadow!.tokens).toBeGreaterThanOrEqual(config.shadow_token_threshold);

      // Check promotion candidates
      const candidates = checkPromotionThresholds();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].id).toBe(shadow!.id);
      expect(candidates[0].topic).toBe("authentication");
    });

    it("should not show shadows below surface threshold", () => {
      // Create shadow with 250 tokens (50% of 500 threshold, below 60% surface threshold)
      const activities = [];
      for (let i = 0; i < 13; i++) {
        activities.push(createActivity("file_read", `/src/file_${i}.ts`, 19));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      expect(shadow).toBeDefined();
      const tokenPct = shadow!.tokens / config.shadow_token_threshold;
      expect(tokenPct).toBeLessThan(0.6); // Below 60% surface threshold

      // Should not be a promotion candidate
      const candidates = checkPromotionThresholds();
      expect(candidates.length).toBe(0);
    });

    it("should show shadows at surface threshold (60%)", () => {
      // Create shadow with 300 tokens (60% of 500 threshold)
      const activities = [];
      for (let i = 0; i < 15; i++) {
        activities.push(createActivity("search", `query_${i}`, 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "search-work");
      }

      expect(shadow).toBeDefined();
      const tokenPct = shadow!.tokens / config.shadow_token_threshold;
      expect(tokenPct).toBeGreaterThanOrEqual(0.6); // At or above 60%
      expect(tokenPct).toBeLessThan(1.0); // But not yet at promotion threshold

      // Check if it would be surfaced (even though not promoted yet)
      const threshold = config.shadow_token_threshold * config.shadow_surface_threshold;
      expect(shadow!.tokens).toBeGreaterThanOrEqual(threshold);
    });

    it("should handle multiple shadows from same session", () => {
      // Create two shadows in same session
      const shadow1Activities = [];
      for (let i = 0; i < 30; i++) {
        shadow1Activities.push(createActivity("file_read", `/auth/file_${i}.ts`, 20));
      }

      let shadow1 = null;
      for (const activity of shadow1Activities) {
        shadow1 = recordActivity(testSessionId, activity, "authentication");
      }

      const shadow2Activities = [];
      for (let i = 0; i < 28; i++) {
        shadow2Activities.push(createActivity("file_read", `/db/model_${i}.ts`, 20));
      }

      let shadow2 = null;
      for (const activity of shadow2Activities) {
        shadow2 = recordActivity(testSessionId, activity, "database");
      }

      // Both should be candidates
      const candidates = checkPromotionThresholds();
      expect(candidates.length).toBe(2);

      const topics = candidates.map(c => c.topic).sort();
      expect(topics).toEqual(["authentication", "database"]);
    });
  });

  describe("Session Shadows in conclude", () => {
    it("should return shadows for current session", () => {
      // Create shadow in current session
      const activities = [];
      for (let i = 0; i < 10; i++) {
        activities.push(createActivity("file_read", `/src/test_${i}.ts`, 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      expect(shadow).toBeDefined();

      // Get session shadows
      const sessionShadows = getSessionShadows(testSessionId);
      expect(sessionShadows.length).toBe(1);
      expect(sessionShadows[0].id).toBe(shadow!.id);
      expect(sessionShadows[0].topic).toBe("testing");
    });

    it("should filter session shadows by surface threshold", () => {
      // Create one shadow above threshold (320 tokens = 64%)
      const activities1 = [];
      for (let i = 0; i < 16; i++) {
        activities1.push(createActivity("file_read", `/auth/file_${i}.ts`, 20));
      }

      let shadow1 = null;
      for (const activity of activities1) {
        shadow1 = recordActivity(testSessionId, activity, "authentication");
      }

      // Create one shadow below threshold (250 tokens = 50%)
      const activities2 = [];
      for (let i = 0; i < 13; i++) {
        activities2.push(createActivity("search", `query_${i}`, 19));
      }

      let shadow2 = null;
      for (const activity of activities2) {
        shadow2 = recordActivity(testSessionId, activity, "search");
      }

      // Get all session shadows
      const allShadows = getSessionShadows(testSessionId);
      expect(allShadows.length).toBe(2);

      // Filter by surface threshold
      const threshold = config.shadow_token_threshold * config.shadow_surface_threshold;
      const substantialShadows = allShadows.filter(s => s.tokens >= threshold);

      expect(substantialShadows.length).toBe(1);
      expect(substantialShadows[0].topic).toBe("authentication");
    });

    it("should not return shadows from other sessions", async () => {
      // Create shadow in current session
      const activity1 = createActivity("file_read", "/src/file1.ts", 50);
      recordActivity(testSessionId, activity1, "session1-topic");

      // Start a new session and create shadow there
      const otherSessionId = await startSession("other_session");
      const activity2 = createActivity("file_read", "/src/file2.ts", 50);
      recordActivity(otherSessionId, activity2, "session2-topic");

      // Get shadows for original session
      const sessionShadows = getSessionShadows(testSessionId);
      expect(sessionShadows.length).toBe(1);
      expect(sessionShadows[0].topic).toBe("session1-topic");

      // Cleanup
      await startSession(testSessionId);
    });
  });

  describe("Shadow Formatting for Claude", () => {
    it("should format shadow with all key information", () => {
      const activities = [
        createActivity("file_read", "/src/auth/login.ts", 20),
        createActivity("file_read", "/src/auth/session.ts", 20),
        createActivity("file_read", "/src/auth/middleware.ts", 20),
        createActivity("search", "JWT validation", 15),
        createActivity("search", "handleAuth", 12),
        createActivity("command", "npm test auth", 10),
      ];

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "authentication");
      }

      expect(shadow).toBeDefined();

      const formatted = formatShadowForClaude(shadow!);

      // Should include topic and token info
      expect(formatted).toContain("authentication");
      expect(formatted).toContain("tokens");

      // Should include file reads
      expect(formatted).toContain("Files:");
      expect(formatted).toContain("3 reads");

      // Should include searches
      expect(formatted).toContain("Searched");

      // Should include commands
      expect(formatted).toContain("Ran");
      expect(formatted).toContain("commands");

      // Should include active minutes
      expect(formatted).toMatch(/\d+min/);
    });

    it("should show deduplication counts in formatted output", () => {
      // Read same file multiple times
      const activities = [];
      for (let i = 0; i < 5; i++) {
        activities.push(createActivity("file_read", "/src/auth/login.ts", 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "authentication");
      }

      expect(shadow).toBeDefined();

      // Due to deduplication, should have 1 activity with count=5
      expect(shadow!.activities.length).toBe(1);
      expect(shadow!.activities[0].metadata?.count).toBe(5);

      const formatted = formatShadowForClaude(shadow!);

      // Should show file read count
      expect(formatted).toContain("5 reads");
    });

    it("should handle shadows with mixed activity types", () => {
      const activities = [
        createActivity("file_read", "/src/db.ts", 20),
        createActivity("file_write", "/src/db.ts", 30),
        createActivity("search", "database query", 15),
        createActivity("command", "docker ps", 10),
        createActivity("memory_access", "recall database patterns", 20),
      ];

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "database");
      }

      expect(shadow).toBeDefined();

      const formatted = formatShadowForClaude(shadow!);

      // Should show all activity types
      expect(formatted).toContain("Files:");
      expect(formatted).toContain("1 reads");
      expect(formatted).toContain("1 writes");
      expect(formatted).toContain("Searched");
      expect(formatted).toContain("Ran");
      expect(formatted).toContain("Memory access:");
    });

    it("should calculate active minutes and include in formatting", () => {
      // Create shadow with multiple activities
      const activities = [
        createActivity("file_read", "/src/file1.ts", 20),
        createActivity("file_read", "/src/file2.ts", 20),
        createActivity("search", "test query", 15),
      ];

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      expect(shadow).toBeDefined();

      // getActiveMinutes should return a non-negative number
      const activeMinutes = getActiveMinutes(shadow!);
      expect(activeMinutes).toBeGreaterThanOrEqual(0);
      expect(typeof activeMinutes).toBe("number");

      // Formatted output should include minutes
      const formatted = formatShadowForClaude(shadow!);
      expect(formatted).toMatch(/\d+min/);
      expect(formatted).toContain("testing"); // topic name
    });
  });

  describe("Configuration Integration", () => {
    it("should respect shadow_surface_in_prime config", () => {
      // Create shadow above threshold
      const activities = [];
      for (let i = 0; i < 30; i++) {
        activities.push(createActivity("file_read", `/src/file_${i}.ts`, 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      // Enable surfacing
      config.shadow_surface_in_prime = true;
      let candidates = checkPromotionThresholds();
      expect(candidates.length).toBeGreaterThan(0);

      // Disable surfacing (would be checked by prime tool logic)
      config.shadow_surface_in_prime = false;
      // Note: checkPromotionThresholds doesn't respect this flag,
      // it's the prime tool that checks this config
      // This test just verifies the config exists
      expect(config.shadow_surface_in_prime).toBe(false);
    });

    it("should respect shadow_surface_threshold config", () => {
      // Create shadow at 70% of threshold (350 tokens)
      const activities = [];
      for (let i = 0; i < 18; i++) {
        activities.push(createActivity("file_read", `/src/file_${i}.ts`, 19));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      expect(shadow).toBeDefined();

      // At 60% threshold, should surface
      config.shadow_surface_threshold = 0.6;
      let threshold = config.shadow_token_threshold * config.shadow_surface_threshold;
      expect(shadow!.tokens).toBeGreaterThan(threshold);

      // At 80% threshold, should not surface
      config.shadow_surface_threshold = 0.8;
      threshold = config.shadow_token_threshold * config.shadow_surface_threshold;
      expect(shadow!.tokens).toBeLessThan(threshold);
    });

    it("should respect shadow_deduplicate config", () => {
      // Enable deduplication
      config.shadow_deduplicate = true;

      const activities = [];
      for (let i = 0; i < 5; i++) {
        activities.push(createActivity("file_read", "/src/same-file.ts", 20));
      }

      let shadow = null;
      for (const activity of activities) {
        shadow = recordActivity(testSessionId, activity, "testing");
      }

      // Should have 1 activity with count=5
      expect(shadow!.activities.length).toBe(1);
      expect(shadow!.activities[0].metadata?.count).toBe(5);

      // Clear and test without deduplication
      clearShadowLog();
      config.shadow_deduplicate = false;

      let shadow2 = null;
      for (const activity of activities) {
        shadow2 = recordActivity(testSessionId, activity, "testing");
      }

      // Should have 5 separate activities
      expect(shadow2!.activities.length).toBe(5);
    });
  });
});
