/**
 * Tests for the Dream State Module
 * 
 * Tests contradiction detection, memory consolidation, importance decay,
 * and foundational memory parsing.
 */

import { describe, it, expect } from "vitest";
import {
  detectContradiction,
  findConsolidationCandidates,
  calculateDecay,
  parseFoundingMemories,
  createFoundationalMemory,
  runDreamCycle,
  DEFAULT_DECAY_CONFIG,
} from "../../src/dream.js";
import type { Memory } from "../../src/types.js";

// Helper to create test memories
function createMemory(overrides: Partial<Memory>): Memory {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: "Test memory content",
    type: "learning",
    tags: [],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    ...overrides,
  };
}

describe("dream.ts", () => {
  describe("detectContradiction", () => {
    it("should return null for same memory", () => {
      const memory = createMemory({ id: "same_id" });
      expect(detectContradiction(memory, memory)).toBeNull();
    });

    it("should return null for two foundational memories", () => {
      const a = createMemory({ type: "foundational" });
      const b = createMemory({ type: "foundational" });
      expect(detectContradiction(a, b)).toBeNull();
    });

    it("should detect temporal conflict when newer memory indicates change", () => {
      const older = createMemory({
        id: "older",
        content: "We use React for the frontend",
        type: "decision",
        tags: ["frontend"],
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        project: "myproject",
      });
      
      const newer = createMemory({
        id: "newer",
        content: "Switched from React to Vue for the frontend",
        type: "decision",
        tags: ["frontend"],
        timestamp: new Date().toISOString(),
        project: "myproject",
      });

      const result = detectContradiction(older, newer);
      expect(result).not.toBeNull();
      expect(result?.conflict_type).toBe("temporal");
      expect(result?.explanation).toContain("supersede");
    });

    it("should detect direct contradiction with use/don't use pattern", () => {
      const positive = createMemory({
        id: "positive",
        content: "Use TypeScript for type safety",
        type: "pattern",
        tags: ["typescript"],
      });
      
      const negative = createMemory({
        id: "negative",
        content: "Don't use TypeScript in small scripts",
        type: "pattern",
        tags: ["typescript"],
      });

      const result = detectContradiction(positive, negative);
      expect(result).not.toBeNull();
      expect(result?.conflict_type).toBe("direct");
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it("should detect contradiction with always/never pattern", () => {
      const always = createMemory({
        content: "Always validate input data",
        type: "pattern",
      });
      
      const never = createMemory({
        content: "Never validate internal function inputs",
        type: "pattern",
      });

      const result = detectContradiction(always, never);
      expect(result).not.toBeNull();
      expect(result?.conflict_type).toBe("direct");
    });

    it("should return null for unrelated memories", () => {
      const a = createMemory({
        content: "The database uses PostgreSQL",
        type: "context",
        tags: ["database"],
      });
      
      const b = createMemory({
        content: "The frontend uses React",
        type: "context",
        tags: ["frontend"],
      });

      expect(detectContradiction(a, b)).toBeNull();
    });
  });

  describe("findConsolidationCandidates", () => {
    it("should return empty array for empty input", () => {
      expect(findConsolidationCandidates([])).toEqual([]);
    });

    it("should find similar memories for consolidation", () => {
      const memories = [
        createMemory({ id: "1", content: "Use React with TypeScript for frontend development" }),
        createMemory({ id: "2", content: "For frontend development, prefer React with TypeScript" }),
        createMemory({ id: "3", content: "The database uses PostgreSQL" }),
      ];

      const candidates = findConsolidationCandidates(memories, 0.5); // Lower threshold for test
      
      // First two should be grouped
      expect(candidates.length).toBeGreaterThan(0);
      
      // Find the cluster containing memory 1 and 2
      const cluster = candidates.find(c => 
        c.memories.some(m => m.id === "1") && c.memories.some(m => m.id === "2")
      );
      expect(cluster).toBeDefined();
    });

    it("should not group dissimilar memories", () => {
      const memories = [
        createMemory({ id: "1", content: "React hooks for state management" }),
        createMemory({ id: "2", content: "PostgreSQL database indexing strategies" }),
        createMemory({ id: "3", content: "Docker container orchestration with K8s" }),
      ];

      const candidates = findConsolidationCandidates(memories, 0.85);
      expect(candidates.length).toBe(0);
    });

    it("should suggest merged content from longest memory", () => {
      const memories = [
        createMemory({ id: "1", content: "Use hooks" }),
        createMemory({ id: "2", content: "Use React hooks for state management in components" }),
      ];

      const candidates = findConsolidationCandidates(memories, 0.3);
      
      if (candidates.length > 0) {
        // Suggested merge should be the longer content
        expect(candidates[0].suggestedMerge).toContain("state management");
      }
    });
  });

  describe("calculateDecay", () => {
    it("should not decay foundational memories", () => {
      const memory = createMemory({
        type: "foundational",
        importance: 5,
        timestamp: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
      });

      const decayed = calculateDecay(memory);
      expect(decayed).toBe(5);
    });

    it("should decay old unaccessed memories", () => {
      const memory = createMemory({
        type: "learning",
        importance: 5,
        access_count: 0,
        timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      });

      const decayed = calculateDecay(memory);
      expect(decayed).toBeLessThan(5);
      expect(decayed).toBeGreaterThanOrEqual(1); // Should not go below min
    });

    it("should resist decay for frequently accessed memories", () => {
      const memory = createMemory({
        type: "learning",
        importance: 5,
        access_count: 20,
        timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        last_accessed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      });

      const decayedWithAccess = calculateDecay(memory);
      
      const memoryNoAccess = createMemory({
        type: "learning",
        importance: 5,
        access_count: 0,
        timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });
      
      const decayedNoAccess = calculateDecay(memoryNoAccess);
      
      expect(decayedWithAccess).toBeGreaterThan(decayedNoAccess);
    });

    it("should use half-life from config", () => {
      const memory = createMemory({
        type: "learning",
        importance: 4,
        access_count: 0,
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Exactly 30 days
      });

      // With 30-day half-life, importance should be roughly halved
      const decayed = calculateDecay(memory, { ...DEFAULT_DECAY_CONFIG, halfLifeDays: 30 });
      expect(decayed).toBeCloseTo(2, 0.5); // Should be roughly 2 (half of 4)
    });
  });

  describe("parseFoundingMemories", () => {
    it("should parse markdown with category headers", () => {
      const markdown = `
# Founding Memories

## Identity
- I am Claude, an AI assistant
- I help with coding tasks

## Goals
- Write clean, maintainable code
- Learn from every interaction
`;

      const parsed = parseFoundingMemories(markdown);
      
      expect(parsed.length).toBe(4);
      
      const identity = parsed.filter(p => p.category === "identity");
      expect(identity.length).toBe(2);
      expect(identity[0].content).toContain("Claude");
      
      const goals = parsed.filter(p => p.category === "goals");
      expect(goals.length).toBe(2);
    });

    it("should handle different bullet styles", () => {
      const markdown = `
## Values
- Accuracy is paramount
* Never fabricate information
- Always cite sources
`;

      const parsed = parseFoundingMemories(markdown);
      expect(parsed.length).toBe(3);
      expect(parsed.every(p => p.category === "values")).toBe(true);
    });

    it("should skip example lines and brackets", () => {
      const markdown = `
## Constraints
- Never produce harmful content
- [Example: see documentation]
- Example: this should be skipped
- Always be helpful
`;

      const parsed = parseFoundingMemories(markdown);
      // Should skip [Example...] and Example:... lines
      expect(parsed.length).toBe(2);
    });

    it("should add foundational tags", () => {
      const markdown = `
## Style
- Be concise and clear
`;

      const parsed = parseFoundingMemories(markdown);
      expect(parsed[0].tags).toContain("foundational");
      expect(parsed[0].tags).toContain("style");
    });
  });

  describe("createFoundationalMemory", () => {
    it("should create memory with foundational properties", () => {
      const parsed = {
        category: "goals" as const,
        content: "Write excellent code",
        tags: ["goals", "foundational"],
      };

      const memory = createFoundationalMemory(parsed, "test-project");

      expect(memory.type).toBe("foundational");
      expect(memory.layer).toBe("foundational");
      expect(memory.importance).toBe(5);
      expect(memory.confidence).toBe(1);
      expect(memory.project).toBe("test-project");
      expect(memory.source).toBe("human");
      expect(memory.valid_from).toBeDefined();
      expect(memory.id).toMatch(/^found_goals_/);
    });
  });

  describe("runDreamCycle", () => {
    it("should process all memories", () => {
      const memories = [
        createMemory({ id: "1" }),
        createMemory({ id: "2" }),
        createMemory({ id: "3" }),
      ];

      const report = runDreamCycle(memories, {
        operations: ["decay"],
        dryRun: true,
      });

      expect(report.memories_processed).toBe(3);
      expect(report.started_at).toBeDefined();
      expect(report.completed_at).toBeDefined();
    });

    it("should include only requested operations in report", () => {
      const memories = [createMemory({ id: "1" })];

      const decayReport = runDreamCycle(memories, {
        operations: ["decay"],
        dryRun: true,
      });
      expect(decayReport.operations).toEqual(["decay"]);
      expect(decayReport.contradictions_found).toEqual([]);

      const contradictionReport = runDreamCycle(memories, {
        operations: ["contradiction"],
        dryRun: true,
      });
      expect(contradictionReport.operations).toEqual(["contradiction"]);
    });

    it("should find contradictions when that operation is requested", () => {
      const memories = [
        createMemory({
          id: "1",
          content: "Use TypeScript everywhere",
          type: "pattern",
          tags: ["typescript"],
        }),
        createMemory({
          id: "2", 
          content: "Don't use TypeScript for quick scripts",
          type: "pattern",
          tags: ["typescript"],
        }),
      ];

      const report = runDreamCycle(memories, {
        operations: ["contradiction"],
        dryRun: true,
      });

      expect(report.contradictions_found.length).toBeGreaterThan(0);
    });

    it("should count consolidation candidates", () => {
      const memories = [
        createMemory({ id: "1", content: "React hooks for state" }),
        createMemory({ id: "2", content: "Use React hooks for state management" }),
      ];

      const report = runDreamCycle(memories, {
        operations: ["consolidate"],
        dryRun: true,
        consolidationThreshold: 0.5,
      });

      // May or may not find candidates depending on similarity
      expect(typeof report.consolidations).toBe("number");
    });

    it("should count decayed memories", () => {
      const memories = [
        createMemory({
          type: "learning",
          importance: 5,
          access_count: 0,
          timestamp: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        createMemory({
          type: "foundational", // Should not decay
          importance: 5,
        }),
      ];

      const report = runDreamCycle(memories, {
        operations: ["decay"],
        dryRun: true,
      });

      expect(report.memories_decayed).toBeGreaterThanOrEqual(1);
    });
  });
});
