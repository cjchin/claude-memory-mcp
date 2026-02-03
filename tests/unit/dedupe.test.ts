/**
 * Unit tests for deduplication utilities
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEDUPE_THRESHOLDS, checkDuplicates } from "../../src/dedupe.js";
import * as db from "../../src/db.js";

// Mock the db module
vi.mock("../../src/db.js", () => ({
  findSimilarMemories: vi.fn(),
}));

describe("Deduplication Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEDUPE_THRESHOLDS", () => {
    it("should have correct threshold constants", () => {
      expect(DEDUPE_THRESHOLDS.STRICT).toBe(0.9);
      expect(DEDUPE_THRESHOLDS.STANDARD).toBe(0.85);
      expect(DEDUPE_THRESHOLDS.LOOSE).toBe(0.7);
      expect(DEDUPE_THRESHOLDS.AUTOMATIC).toBe(0.8);
    });

    it("should be readonly at compile time", () => {
      // TypeScript enforces immutability at compile time with 'as const'
      // At runtime, the object is a regular object, but TS prevents modification
      expect(Object.isFrozen(DEDUPE_THRESHOLDS)).toBe(false); // Not frozen, but TS readonly
      expect(typeof DEDUPE_THRESHOLDS).toBe("object");
    });
  });

  describe("checkDuplicates", () => {
    it("should use STANDARD threshold by default", async () => {
      const mockResults = [
        { id: "mem_1", content: "Test", similarity: 0.86 },
      ];
      vi.mocked(db.findSimilarMemories).mockResolvedValue(mockResults as any);

      const results = await checkDuplicates("test content");

      expect(db.findSimilarMemories).toHaveBeenCalledWith(
        "test content",
        DEDUPE_THRESHOLDS.STANDARD
      );
      expect(results).toEqual(mockResults);
    });

    it("should use STRICT threshold when specified", async () => {
      const mockResults = [
        { id: "mem_1", content: "Test", similarity: 0.91 },
      ];
      vi.mocked(db.findSimilarMemories).mockResolvedValue(mockResults as any);

      await checkDuplicates("test content", "STRICT");

      expect(db.findSimilarMemories).toHaveBeenCalledWith(
        "test content",
        DEDUPE_THRESHOLDS.STRICT
      );
    });

    it("should use LOOSE threshold when specified", async () => {
      const mockResults = [
        { id: "mem_1", content: "Test", similarity: 0.72 },
      ];
      vi.mocked(db.findSimilarMemories).mockResolvedValue(mockResults as any);

      await checkDuplicates("test content", "LOOSE");

      expect(db.findSimilarMemories).toHaveBeenCalledWith(
        "test content",
        DEDUPE_THRESHOLDS.LOOSE
      );
    });

    it("should use AUTOMATIC threshold when specified", async () => {
      const mockResults = [
        { id: "mem_1", content: "Test", similarity: 0.81 },
      ];
      vi.mocked(db.findSimilarMemories).mockResolvedValue(mockResults as any);

      await checkDuplicates("test content", "AUTOMATIC");

      expect(db.findSimilarMemories).toHaveBeenCalledWith(
        "test content",
        DEDUPE_THRESHOLDS.AUTOMATIC
      );
    });

    it("should return empty array when no duplicates found", async () => {
      vi.mocked(db.findSimilarMemories).mockResolvedValue([]);

      const results = await checkDuplicates("unique content");

      expect(results).toEqual([]);
    });

    it("should handle errors from findSimilarMemories", async () => {
      vi.mocked(db.findSimilarMemories).mockRejectedValue(
        new Error("Database error")
      );

      await expect(checkDuplicates("test")).rejects.toThrow("Database error");
    });
  });
});
