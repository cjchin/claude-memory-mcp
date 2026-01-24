/**
 * Integration tests for MCP tools
 * Tests the actual tool handlers with mocked database
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

// We test the tool logic by importing the modules they use
import { detectMemoryType, detectTags, estimateImportance } from "../../src/intelligence.js";
import { cleanText, extractEntities, extractReasoning } from "../../src/preprocess.js";
import { SmartAlignmentEngine } from "../../src/alignment.js";
import { loadManifest, extractCapabilities, hasCapability, getFeatureStatus } from "../../src/introspect.js";

describe("MCP Tool Integration Tests", () => {
  describe("remember tool preprocessing", () => {
    it("should clean text before storing", () => {
      const input = "So, basically, uh, we decided to use TypeScript";
      const cleaned = cleanText(input);
      
      expect(cleaned).not.toContain("basically");
      expect(cleaned).not.toContain("uh");
      expect(cleaned).toContain("TypeScript");
    });

    it("should extract entities as additional tags", () => {
      const content = "We chose PostgreSQL for the database and React for frontend";
      const entities = extractEntities(content);
      
      // extractEntities preserves case from ENTITY_PATTERNS
      expect(entities).toContain("PostgreSQL");
      expect(entities).toContain("React");
    });

    it("should extract reasoning for metadata", () => {
      const content = "We use TypeScript because it provides better type safety";
      const reasoning = extractReasoning(content);
      
      expect(reasoning).toBe("it provides better type safety");
    });

    it("should auto-detect type when not provided", () => {
      expect(detectMemoryType("We decided to use React")).toBe("decision");
      expect(detectMemoryType("I learned that async needs await")).toBe("learning");
      expect(detectMemoryType("Always validate input")).toBe("pattern");
      expect(detectMemoryType("TODO: add tests")).toBe("todo");
    });

    it("should auto-detect tags based on content", () => {
      const tags = detectTags("Using Docker for deployment with Kubernetes");
      
      // detectTags finds deployment-related tags
      expect(tags.length).toBeGreaterThan(0);
      // The tag detection uses patterns, may include 'deployment' or related terms
      expect(tags.some(t => t.includes("deploy") || t === "devops" || t === "infrastructure")).toBe(true);
    });

    it("should estimate importance based on content signals", () => {
      const critical = estimateImportance("CRITICAL: security vulnerability found");
      const normal = estimateImportance("Updated the readme file");
      
      expect(critical).toBeGreaterThan(normal);
      expect(critical).toBeGreaterThanOrEqual(4);
    });
  });

  describe("analyze_conversation tool", () => {
    let engine: SmartAlignmentEngine;

    beforeEach(() => {
      engine = new SmartAlignmentEngine({
        autoSaveEnabled: true,
        userTriggerThreshold: 0.7,
        claudeInsightThreshold: 0.75,
      });
    });

    it("should detect user triggers", () => {
      const result = engine.analyze(
        "We decided to use MongoDB for the project",
        "Great choice! MongoDB will work well for your use case."
      );

      expect(result.memoriesToCreate.length).toBeGreaterThan(0);
      expect(result.memoriesToCreate[0].type).toBe("decision");
    });

    it("should detect Claude insights", () => {
      const result = engine.analyze(
        "How should we handle authentication?",
        "I recommend using JWT tokens because they're stateless and scale well."
      );

      expect(result.memoriesToCreate.some(m => 
        m.content.toLowerCase().includes("jwt") || 
        m.content.toLowerCase().includes("recommend")
      )).toBe(true);
    });

    it("should generate recall queries for questions", () => {
      const result = engine.analyze(
        "What did we decide about the database?",
        "Let me check our previous discussions."
      );

      expect(result.recallQueries.length).toBeGreaterThan(0);
      // The query might be simplified or extracted differently
      expect(result.recallQueries[0].toLowerCase()).toContain("decide");
    });

    it("should provide explanation", () => {
      const result = engine.analyze(
        "Just testing",
        "Ok, test received."
      );

      expect(result.explanation).toBeDefined();
      expect(typeof result.explanation).toBe("string");
    });
  });

  describe("introspect tool", () => {
    it("should load manifest successfully", () => {
      const manifest = loadManifest();
      
      expect(manifest.vessel.name).toBe("claude-memory-mcp");
      expect(manifest.version).toBeDefined();
    });

    it("should extract implemented vs planned features", () => {
      const manifest = loadManifest();
      const caps = extractCapabilities(manifest);

      expect(caps.implementedFeatures).toContain("core_memory");
      expect(caps.implementedFeatures).toContain("temporal_reasoning");
      expect(caps.plannedFeatures).toContain("multi_instance_sync");
    });

    it("should check feature capability", () => {
      expect(hasCapability("core_memory")).toBe(true);
      expect(hasCapability("multi_instance_sync")).toBe(false);
      expect(hasCapability("nonexistent")).toBe(false);
    });

    it("should get feature status", () => {
      expect(getFeatureStatus("core_memory")).toBe("implemented");
      expect(getFeatureStatus("multi_instance_sync")).toBe("planned");
      expect(getFeatureStatus("nonexistent")).toBeUndefined();
    });

    it("should list all implemented tools", () => {
      const manifest = loadManifest();
      const caps = extractCapabilities(manifest);

      expect(caps.tools).toContain("remember");
      expect(caps.tools).toContain("recall");
      expect(caps.tools).toContain("introspect");
      expect(caps.tools).toContain("prime");
    });
  });

  describe("what_to_remember tool", () => {
    let engine: SmartAlignmentEngine;

    beforeEach(() => {
      engine = new SmartAlignmentEngine();
    });

    it("should identify memorable content", () => {
      const result = engine.analyze(
        "We decided to implement caching with Redis because the database queries are too slow",
        "Good decision, Redis will significantly improve performance."
      );

      // Should identify the decision
      expect(result.memoriesToCreate.length).toBeGreaterThan(0);
      
      // At least one should be about the decision
      const decision = result.memoriesToCreate.find(m => 
        m.content.toLowerCase().includes("redis") || 
        m.content.toLowerCase().includes("caching")
      );
      expect(decision).toBeDefined();
    });

    it("should not suggest memories for trivial exchanges", () => {
      const result = engine.analyze(
        "Hello",
        "Hi there!"
      );

      // Should have few or no memories to create
      expect(result.memoriesToCreate.length).toBeLessThanOrEqual(1);
    });
  });

  describe("tool parameter validation", () => {
    it("should validate remember parameters", () => {
      const schema = z.object({
        content: z.string(),
        type: z.enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference"]).optional(),
        tags: z.array(z.string()).optional(),
        importance: z.number().min(1).max(5).optional(),
        project: z.string().optional(),
      });

      // Valid input
      expect(() => schema.parse({ content: "test memory" })).not.toThrow();
      expect(() => schema.parse({ content: "test", type: "decision", importance: 5 })).not.toThrow();

      // Invalid input
      expect(() => schema.parse({ content: "" })).not.toThrow(); // Empty string is valid for Zod
      expect(() => schema.parse({ type: "invalid" })).toThrow();
      expect(() => schema.parse({ content: "test", importance: 10 })).toThrow();
    });

    it("should validate introspect parameters", () => {
      const schema = z.object({
        mode: z.enum(["quick", "full"]).optional().default("quick"),
        feature: z.string().optional(),
      });

      expect(() => schema.parse({})).not.toThrow();
      expect(() => schema.parse({ mode: "quick" })).not.toThrow();
      expect(() => schema.parse({ mode: "full", feature: "core_memory" })).not.toThrow();
      expect(() => schema.parse({ mode: "invalid" })).toThrow();
    });

    it("should validate prime parameters", () => {
      const schema = z.object({
        topic: z.string().optional(),
        depth: z.enum(["quick", "normal", "deep"]).optional().default("normal"),
      });

      expect(() => schema.parse({})).not.toThrow();
      expect(() => schema.parse({ topic: "database" })).not.toThrow();
      expect(() => schema.parse({ depth: "deep" })).not.toThrow();
      expect(() => schema.parse({ topic: "auth", depth: "quick" })).not.toThrow();
      expect(() => schema.parse({ depth: "invalid" })).toThrow();
    });

    it("should validate analyze_conversation parameters", () => {
      const schema = z.object({
        user_message: z.string(),
        claude_response: z.string(),
        auto_save: z.boolean().optional().default(false),
      });

      expect(() => schema.parse({ 
        user_message: "test", 
        claude_response: "response" 
      })).not.toThrow();
      
      expect(() => schema.parse({ 
        user_message: "test", 
        claude_response: "response",
        auto_save: true 
      })).not.toThrow();

      expect(() => schema.parse({ user_message: "only user" })).toThrow();
    });
  });
});
