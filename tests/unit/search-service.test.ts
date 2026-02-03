/**
 * Unit tests for search service
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  searchWithContext,
  searchCurrentProject,
  searchAllProjects,
} from "../../src/search-service.js";
import * as db from "../../src/db.js";
import { config } from "../../src/config.js";

// Mock the db module
vi.mock("../../src/db.js", () => ({
  searchMemories: vi.fn(),
  getCurrentSessionId: vi.fn().mockReturnValue("test-session"),
}));

describe("Search Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config
    config.current_project = undefined;
  });

  describe("searchWithContext", () => {
    it("should use current_project when no project specified", async () => {
      config.current_project = "my-project";
      const mockResults = [
        { id: "mem_1", content: "Test", similarity: 0.9 },
      ];
      vi.mocked(db.searchMemories).mockResolvedValue(mockResults as any);

      const results = await searchWithContext("test query");

      expect(db.searchMemories).toHaveBeenCalledWith("test query", {
        limit: 5,
        project: "my-project",
        types: undefined,
        tags: undefined,
        minImportance: undefined,
      });
      expect(results).toEqual(mockResults);
    });

    it("should use undefined project when current_project not set", async () => {
      config.current_project = undefined;
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test query");

      expect(db.searchMemories).toHaveBeenCalledWith("test query", {
        limit: 5,
        project: undefined,
        types: undefined,
        tags: undefined,
        minImportance: undefined,
      });
    });

    it("should override current_project when explicitly provided", async () => {
      config.current_project = "default-project";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", { project: "override-project" });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 5,
        project: "override-project",
        types: undefined,
        tags: undefined,
        minImportance: undefined,
      });
    });

    it("should allow explicit undefined project to search all", async () => {
      config.current_project = "my-project";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", { project: undefined });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 5,
        project: undefined, // Explicit undefined should override current_project
        types: undefined,
        tags: undefined,
        minImportance: undefined,
      });
    });

    it("should pass through limit option", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", { limit: 10 });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 10,
        project: undefined,
        types: undefined,
        tags: undefined,
        minImportance: undefined,
      });
    });

    it("should pass through types filter", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", {
        types: ["decision", "pattern"],
      });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 5,
        project: undefined,
        types: ["decision", "pattern"],
        tags: undefined,
        minImportance: undefined,
      });
    });

    it("should pass through tags filter", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", {
        tags: ["typescript", "api"],
      });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 5,
        project: undefined,
        types: undefined,
        tags: ["typescript", "api"],
        minImportance: undefined,
      });
    });

    it("should pass through minImportance filter", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", {
        minImportance: 4,
      });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 5,
        project: undefined,
        types: undefined,
        tags: undefined,
        minImportance: 4,
      });
    });

    it("should handle all options together", async () => {
      config.current_project = "default";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchWithContext("test", {
        project: "custom",
        limit: 20,
        types: ["learning"],
        tags: ["bug"],
        minImportance: 3,
      });

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 20,
        project: "custom",
        types: ["learning"],
        tags: ["bug"],
        minImportance: 3,
      });
    });

    it("should return search results", async () => {
      const mockResults = [
        { id: "mem_1", content: "Result 1", similarity: 0.9 },
        { id: "mem_2", content: "Result 2", similarity: 0.8 },
      ];
      vi.mocked(db.searchMemories).mockResolvedValue(mockResults as any);

      const results = await searchWithContext("query");

      expect(results).toEqual(mockResults);
    });
  });

  describe("searchCurrentProject", () => {
    it("should search within current project", async () => {
      config.current_project = "active-project";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchCurrentProject("test query");

      expect(db.searchMemories).toHaveBeenCalledWith("test query", {
        limit: 5,
        project: "active-project",
      });
    });

    it("should throw error when no current project set", async () => {
      config.current_project = undefined;

      await expect(searchCurrentProject("test")).rejects.toThrow(
        "No current project set"
      );
    });

    it("should respect custom limit", async () => {
      config.current_project = "my-project";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchCurrentProject("test", 10);

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 10,
        project: "my-project",
      });
    });

    it("should return search results", async () => {
      config.current_project = "project";
      const mockResults = [{ id: "mem_1", content: "Test" }];
      vi.mocked(db.searchMemories).mockResolvedValue(mockResults as any);

      const results = await searchCurrentProject("query");

      expect(results).toEqual(mockResults);
    });
  });

  describe("searchAllProjects", () => {
    it("should search across all projects with undefined", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchAllProjects("test query");

      expect(db.searchMemories).toHaveBeenCalledWith("test query", {
        limit: 10,
        project: undefined,
      });
    });

    it("should use default limit of 10", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchAllProjects("test");

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 10,
        project: undefined,
      });
    });

    it("should respect custom limit", async () => {
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchAllProjects("test", 20);

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 20,
        project: undefined,
      });
    });

    it("should return search results from all projects", async () => {
      const mockResults = [
        { id: "mem_1", content: "From project A", project: "A" },
        { id: "mem_2", content: "From project B", project: "B" },
      ];
      vi.mocked(db.searchMemories).mockResolvedValue(mockResults as any);

      const results = await searchAllProjects("query");

      expect(results).toEqual(mockResults);
    });

    it("should ignore current_project setting", async () => {
      config.current_project = "some-project";
      vi.mocked(db.searchMemories).mockResolvedValue([]);

      await searchAllProjects("test");

      expect(db.searchMemories).toHaveBeenCalledWith("test", {
        limit: 10,
        project: undefined, // Should be undefined despite current_project
      });
    });
  });
});
