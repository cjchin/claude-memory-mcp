/**
 * LLM Abstraction Layer Tests
 * 
 * Tests the LLM provider abstraction without making actual API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OllamaProvider,
  LMStudioProvider,
  OpenAICompatibleProvider,
  AnthropicProvider,
  OpenRouterProvider,
  getLLMProvider,
  clearLLMProviderCache,
  isLLMAvailable,
  judgeContradiction,
  judgeConsolidation,
} from "../../src/llm.js";
import { config } from "../../src/config.js";

describe("LLM Provider Implementations", () => {
  describe("OllamaProvider", () => {
    it("should construct with host and model", () => {
      const provider = new OllamaProvider({
        host: "http://localhost:11434",
        model: "deepseek-coder:6.7b",
      });
      expect(provider.name).toBe("ollama");
      expect(provider.model).toBe("deepseek-coder:6.7b");
    });

    it("should return false for isAvailable when server is down", async () => {
      const provider = new OllamaProvider({
        host: "http://localhost:99999", // Invalid port
        model: "test",
      });
      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("LMStudioProvider", () => {
    it("should construct with host and model", () => {
      const provider = new LMStudioProvider({
        host: "http://localhost:1234/v1",
        model: "local-model",
      });
      expect(provider.name).toBe("lmstudio");
      expect(provider.model).toBe("local-model");
    });
  });

  describe("OpenAICompatibleProvider", () => {
    it("should construct with custom name", () => {
      const provider = new OpenAICompatibleProvider({
        name: "test-provider",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "gpt-4",
      });
      expect(provider.name).toBe("test-provider");
      expect(provider.model).toBe("gpt-4");
    });
  });

  describe("AnthropicProvider", () => {
    it("should construct with apiKey and model", () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-opus-20240229",
      });
      expect(provider.name).toBe("anthropic");
      expect(provider.model).toBe("claude-3-opus-20240229");
    });

    it("should return true for isAvailable when apiKey exists", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-opus",
      });
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe("OpenRouterProvider", () => {
    it("should construct with apiKey and model", () => {
      const provider = new OpenRouterProvider({
        apiKey: "test-key",
        model: "anthropic/claude-3-opus",
      });
      expect(provider.name).toBe("openrouter");
      expect(provider.model).toBe("anthropic/claude-3-opus");
    });
  });
});

describe("LLM Factory", () => {
  const originalConfig = { ...config };

  afterEach(() => {
    // Restore config after each test
    Object.assign(config, originalConfig);
    (config as any).llm = undefined;
    // Force refresh of cached provider
    getLLMProvider(true);
  });

  it("should return null when no LLM is configured", () => {
    (config as any).llm = undefined;
    const provider = getLLMProvider(true);
    expect(provider).toBeNull();
  });

  it("should create OllamaProvider when configured", () => {
    (config as any).llm = {
      provider: "ollama",
      model: "test-model",
    };
    const provider = getLLMProvider(true);
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("ollama");
    expect(provider!.model).toBe("test-model");
  });

  it("should use default model when not specified", () => {
    (config as any).llm = {
      provider: "ollama",
    };
    const provider = getLLMProvider(true);
    expect(provider!.model).toBe("deepseek-coder:6.7b");
  });

  it("should require apiKey for Anthropic", () => {
    (config as any).llm = {
      provider: "anthropic",
    };
    const provider = getLLMProvider(true);
    expect(provider).toBeNull();
  });

  it("should create AnthropicProvider with apiKey", () => {
    (config as any).llm = {
      provider: "anthropic",
      apiKey: "test-key",
    };
    const provider = getLLMProvider(true);
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("anthropic");
  });
});

describe("Judgment Functions - Heuristic Fallback", () => {
  beforeEach(() => {
    // Ensure no LLM is configured (forces heuristic fallback)
    (config as any).llm = undefined;
    clearLLMProviderCache();
  });

  afterEach(() => {
    clearLLMProviderCache();
  });

  describe("judgeContradiction", () => {
    it("should return heuristic judgment when no LLM available", async () => {
      (config as any).llm = undefined;
      clearLLMProviderCache();
      
      const memA = {
        id: "mem-a",
        content: "We use MongoDB",
        type: "decision",
        timestamp: "2024-01-01T00:00:00Z",
        importance: 3,
      };
      const memB = {
        id: "mem-b",
        content: "We now use PostgreSQL instead",
        type: "decision",
        timestamp: "2024-06-01T00:00:00Z",
        importance: 3,
      };

      const judgment = await judgeContradiction(memA, memB);

      expect(judgment.isRealConflict).toBe(true);
      expect(judgment.conflictType).toBe("temporal_supersession");
      expect(judgment.resolution).toBe("supersede_a"); // A is older
      expect(judgment.confidence).toBeLessThanOrEqual(0.5); // 0.4-0.5 depending on path
      expect(judgment.reasoning).toContain("heuristic");
    });

    it("should determine newer memory supersedes older", async () => {
      const older = {
        id: "older",
        content: "Old decision",
        type: "decision",
        timestamp: "2024-01-01T00:00:00Z",
        importance: 3,
      };
      const newer = {
        id: "newer",
        content: "New decision",
        type: "decision",
        timestamp: "2024-12-01T00:00:00Z",
        importance: 3,
      };

      const judgment = await judgeContradiction(older, newer);
      expect(judgment.resolution).toBe("supersede_a"); // older (A) gets superseded

      const reverseJudgment = await judgeContradiction(newer, older);
      expect(reverseJudgment.resolution).toBe("supersede_b"); // older (B) gets superseded
    });
  });

  describe("judgeConsolidation", () => {
    it("should return heuristic merge when no LLM available", async () => {
      (config as any).llm = undefined;
      clearLLMProviderCache();
      
      const memories = [
        { id: "m1", content: "Short content", type: "learning", tags: ["test"], importance: 3 },
        { id: "m2", content: "Much longer content that should be kept", type: "learning", tags: ["test", "more"], importance: 4 },
      ];

      const judgment = await judgeConsolidation(memories);

      expect(judgment.shouldMerge).toBe(true);
      // When no heuristicMerge is provided, it picks the longest content
      expect(judgment.mergedContent).toBeDefined();
      expect(judgment.mergedTags).toContain("test");
      expect(judgment.mergedTags).toContain("more");
      expect(judgment.importance).toBe(4); // Max importance
      expect(judgment.confidence).toBeLessThanOrEqual(0.5);
    });

    it("should use provided heuristic merge if given", async () => {
      const memories = [
        { id: "m1", content: "Content A", type: "learning", tags: [], importance: 2 },
      ];
      const customMerge = "Custom merged content";

      const judgment = await judgeConsolidation(memories, customMerge);

      expect(judgment.mergedContent).toBe(customMerge);
    });
  });
});

describe("isLLMAvailable", () => {
  afterEach(() => {
    (config as any).llm = undefined;
    clearLLMProviderCache();
  });

  it("should return false when no LLM configured", async () => {
    (config as any).llm = undefined;
    clearLLMProviderCache();
    const available = await isLLMAvailable();
    expect(available).toBe(false);
  });

  it("should return false when provider is unavailable", async () => {
    (config as any).llm = {
      provider: "ollama",
      baseUrl: "http://localhost:99999", // Invalid
      model: "test",
    };
    getLLMProvider(true);
    const available = await isLLMAvailable();
    expect(available).toBe(false);
  });
});
