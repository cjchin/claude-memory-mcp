/**
 * Unit tests for formatting utilities
 */

import { describe, it, expect } from "vitest";
import {
  formatHeader,
  formatStats,
  formatBar,
  formatPercent,
  formatList,
  formatTable,
  formatDivider,
  truncate,
  formatCount,
} from "../../src/tools/formatters.js";

describe("Formatting Utilities", () => {
  describe("formatHeader", () => {
    it("should format a centered header with default width", () => {
      const result = formatHeader("TEST");
      expect(result).toContain("TEST");
      expect(result).toContain("╔");
      expect(result).toContain("╗");
      expect(result).toContain("╚");
      expect(result).toContain("╝");
      expect(result.split("\n")).toHaveLength(3);
    });

    it("should handle long titles", () => {
      const longTitle = "A".repeat(70);
      const result = formatHeader(longTitle, 80);
      expect(result).toContain(longTitle);
    });

    it("should respect custom width", () => {
      const result = formatHeader("TEST", 20);
      const lines = result.split("\n");
      expect(lines[0].length).toBe(22); // width + 2 for borders
    });
  });

  describe("formatStats", () => {
    it("should format statistics without title", () => {
      const stats = { total: 100, active: 50, idle: 30 };
      const result = formatStats(stats);
      expect(result).toContain("total: 100");
      expect(result).toContain("active: 50");
      expect(result).toContain("idle: 30");
    });

    it("should format statistics with title", () => {
      const stats = { count: 42 };
      const result = formatStats(stats, "Memory Stats");
      expect(result).toContain("Memory Stats:");
      expect(result).toContain("count: 42");
    });

    it("should handle empty stats", () => {
      const result = formatStats({});
      expect(result).toBe("");
    });

    it("should handle string values", () => {
      const stats = { name: "test", status: "active" };
      const result = formatStats(stats);
      expect(result).toContain("name: test");
      expect(result).toContain("status: active");
    });
  });

  describe("formatBar", () => {
    it("should create progress bar at 0%", () => {
      const result = formatBar(0, 100, 10);
      expect(result).toBe("░░░░░░░░░░");
    });

    it("should create progress bar at 100%", () => {
      const result = formatBar(100, 100, 10);
      expect(result).toBe("██████████");
    });

    it("should create progress bar at 50%", () => {
      const result = formatBar(50, 100, 10);
      expect(result).toBe("█████░░░░░");
    });

    it("should handle decimal percentages", () => {
      const result = formatBar(0.75, 1, 20);
      expect(result.length).toBe(20);
      expect(result).toMatch(/^█+░+$/);
    });

    it("should use custom characters", () => {
      const result = formatBar(5, 10, 10, "#", "-");
      expect(result).toBe("#####-----");
    });
  });

  describe("formatPercent", () => {
    it("should format percentage with 0 decimals by default", () => {
      expect(formatPercent(0.75)).toBe("75%");
      expect(formatPercent(0.5)).toBe("50%");
      expect(formatPercent(1)).toBe("100%");
    });

    it("should format percentage with specified decimals", () => {
      expect(formatPercent(0.333, 1)).toBe("33.3%");
      expect(formatPercent(0.666, 2)).toBe("66.60%");
    });

    it("should handle 0 and 1", () => {
      expect(formatPercent(0)).toBe("0%");
      expect(formatPercent(1)).toBe("100%");
    });
  });

  describe("formatList", () => {
    it("should format bullet list with default bullet", () => {
      const items = ["Item 1", "Item 2", "Item 3"];
      const result = formatList(items);
      expect(result).toContain("• Item 1");
      expect(result).toContain("• Item 2");
      expect(result).toContain("• Item 3");
    });

    it("should use custom bullet character", () => {
      const items = ["Task A", "Task B"];
      const result = formatList(items, "-");
      expect(result).toContain("- Task A");
      expect(result).toContain("- Task B");
    });

    it("should respect custom indentation", () => {
      const items = ["One"];
      const result = formatList(items, "•", 4);
      expect(result).toMatch(/^\s{4}•/);
    });

    it("should handle empty list", () => {
      const result = formatList([]);
      expect(result).toBe("");
    });
  });

  describe("formatTable", () => {
    it("should format key-value table", () => {
      const data = { Name: "John", Age: 30, City: "NYC" };
      const result = formatTable(data);
      expect(result).toContain("Name: John");
      expect(result).toContain("Age : 30");
      expect(result).toContain("City: NYC");
    });

    it("should respect custom key width", () => {
      const data = { A: 1, B: 2 };
      const result = formatTable(data, 10);
      const lines = result.split("\n");
      expect(lines[0]).toMatch(/^A\s{9}: 1$/);
    });

    it("should use custom separator", () => {
      const data = { key: "value" };
      const result = formatTable(data, undefined, " = ");
      expect(result).toContain("key = value");
    });

    it("should handle boolean values", () => {
      const data = { enabled: true, disabled: false };
      const result = formatTable(data);
      expect(result).toContain("enabled : true");
      expect(result).toContain("disabled: false");
    });
  });

  describe("formatDivider", () => {
    it("should create divider with default width", () => {
      const result = formatDivider();
      expect(result.length).toBe(60);
      expect(result).toMatch(/^─+$/);
    });

    it("should create divider with custom width", () => {
      const result = formatDivider(20);
      expect(result.length).toBe(20);
    });

    it("should use custom character", () => {
      const result = formatDivider(10, "=");
      expect(result).toBe("==========");
    });
  });

  describe("truncate", () => {
    it("should not truncate short text", () => {
      const text = "Short text";
      expect(truncate(text, 20)).toBe(text);
    });

    it("should truncate long text with ellipsis", () => {
      const text = "This is a very long text that needs truncation";
      const result = truncate(text, 20);
      expect(result.length).toBe(20);
      expect(result).toMatch(/\.\.\.$/);
    });

    it("should handle custom ellipsis", () => {
      const text = "Long text here";
      const result = truncate(text, 10, "...");
      expect(result.length).toBe(10);
      expect(result).toContain("...");
    });

    it("should handle exact length match", () => {
      const text = "Exact";
      expect(truncate(text, 5)).toBe("Exact");
    });
  });

  describe("formatCount", () => {
    it("should format count with emoji", () => {
      const result = formatCount(5, "✅");
      expect(result).toBe("✅ 5");
    });

    it("should format count with emoji and label", () => {
      const result = formatCount(10, "📝", "items");
      expect(result).toBe("📝 10 items");
    });

    it("should handle zero count", () => {
      const result = formatCount(0, "❌", "errors");
      expect(result).toBe("❌ 0 errors");
    });
  });
});
