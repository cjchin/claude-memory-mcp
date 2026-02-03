/**
 * Unit tests for error handling utilities
 */

import { describe, it, expect, vi } from "vitest";
import {
  toolSafeWrapper,
  formatError,
  errorResponse,
  withRetry,
} from "../../src/tools/error-handler.js";

describe("Error Handling Utilities", () => {
  describe("toolSafeWrapper", () => {
    it("should return result on success", async () => {
      const handler = async () => ({
        content: [{ type: "text" as const, text: "Success!" }],
      });

      const wrapped = toolSafeWrapper(handler, "test operation");
      const result = await wrapped();

      expect(result.content[0].text).toBe("Success!");
    });

    it("should catch and format errors", async () => {
      const handler = async () => {
        throw new Error("Test error");
      };

      const wrapped = toolSafeWrapper(handler, "test operation");
      const result = await wrapped();

      expect(result.content[0].text).toContain("❌ Failed test operation");
      expect(result.content[0].text).toContain("Test error");
    });

    it("should handle non-Error exceptions", async () => {
      const handler = async () => {
        throw "String error";
      };

      const wrapped = toolSafeWrapper(handler, "test operation");
      const result = await wrapped();

      expect(result.content[0].text).toContain("String error");
    });

    it("should log errors to console", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = async () => {
        throw new Error("Logged error");
      };

      const wrapped = toolSafeWrapper(handler, "test operation");
      await wrapped();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error test operation:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should preserve handler arguments", async () => {
      const handler = async (a: number, b: string) => ({
        content: [{ type: "text" as const, text: `${a}-${b}` }],
      });

      const wrapped = toolSafeWrapper(handler, "test");
      const result = await wrapped(42, "test");

      expect(result.content[0].text).toBe("42-test");
    });
  });

  describe("formatError", () => {
    it("should format Error objects with message", () => {
      const error = new Error("Test error message");
      const formatted = formatError(error);

      expect(formatted).toContain("Test error message");
    });

    it("should include stack trace (first 3 lines)", () => {
      const error = new Error("Stack test");
      Error.captureStackTrace?.(error);

      const formatted = formatError(error);

      expect(formatted).toContain("Stack test");
      // Stack trace should be included
      if (error.stack) {
        expect(formatted.split("\n").length).toBeGreaterThan(1);
      }
    });

    it("should handle non-Error objects", () => {
      const formatted = formatError("Plain string error");
      expect(formatted).toBe("Plain string error");
    });

    it("should handle null/undefined", () => {
      expect(formatError(null)).toBe("null");
      expect(formatError(undefined)).toBe("undefined");
    });

    it("should handle objects without stack", () => {
      const error = new Error("No stack");
      error.stack = undefined;

      const formatted = formatError(error);

      expect(formatted).toBe("No stack");
    });
  });

  describe("errorResponse", () => {
    it("should create standardized error response", () => {
      const response = errorResponse("saving memory", new Error("DB error"));

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toContain("❌ Failed saving memory");
      expect(response.content[0].text).toContain("DB error");
    });

    it("should handle non-Error exceptions", () => {
      const response = errorResponse("operation", "String error");

      expect(response.content[0].text).toContain("❌ Failed operation");
      expect(response.content[0].text).toContain("String error");
    });
  });

  describe("withRetry", () => {
    it("should return result on first success", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 100 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on transient failure", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("connection refused"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValue("success");

      const result = await withRetry(fn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("timeout"));

      await expect(
        withRetry(fn, { maxRetries: 3, initialDelayMs: 10 })
      ).rejects.toThrow("timeout");

      expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it("should not retry non-transient errors by default", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("validation failed"));

      await expect(
        withRetry(fn, { maxRetries: 3, initialDelayMs: 10 })
      ).rejects.toThrow("validation failed");

      expect(fn).toHaveBeenCalledTimes(1); // No retry for non-transient
    });

    it("should log retry attempts", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("connection refused"))
        .mockResolvedValue("success");

      await withRetry(fn, { maxRetries: 2, initialDelayMs: 10 });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Attempt 1/"),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should work with default parameters", async () => {
      const fn = vi.fn().mockResolvedValue("default success");

      const result = await withRetry(fn);

      expect(result).toBe("default success");
    });
  });
});
