/**
 * Tests for the Preprocessing Module
 * 
 * Tests text cleaning, entity extraction, reasoning extraction,
 * and the full preprocessing pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  cleanText,
  extractEntities,
  extractReasoning,
  extractCoreStatement,
  generateEmbeddingText,
  preprocess,
  preprocessFoundational,
} from "../../src/preprocess.js";

describe("preprocess.ts", () => {
  describe("cleanText", () => {
    it("should remove filler words", () => {
      const input = "So basically, I think we should um use TypeScript";
      const result = cleanText(input);
      expect(result).not.toContain("basically");
      expect(result).not.toContain("um");
      expect(result).toContain("TypeScript");
    });

    it("should normalize whitespace", () => {
      const input = "Multiple   spaces   here   and\ttabs";
      const result = cleanText(input);
      expect(result).not.toContain("  ");
      expect(result).not.toContain("\t");
    });

    it("should fix punctuation spacing", () => {
      const input = "Hello , world .How are you";
      const result = cleanText(input);
      expect(result).toContain("Hello,");
      expect(result).toContain("world.");
      expect(result).toContain(". How"); // Space after period
    });

    it("should handle empty string", () => {
      expect(cleanText("")).toBe("");
    });

    it("should preserve meaningful content", () => {
      const input = "Use PostgreSQL for the database with proper indexing";
      const result = cleanText(input);
      expect(result).toContain("PostgreSQL");
      expect(result).toContain("database");
      expect(result).toContain("indexing");
    });
  });

  describe("extractEntities", () => {
    it("should extract technology names", () => {
      const input = "We're using React with TypeScript and PostgreSQL";
      const entities = extractEntities(input);
      expect(entities).toContain("React");
      expect(entities).toContain("TypeScript");
      expect(entities).toContain("PostgreSQL");
    });

    it("should handle variations (postgres, psql)", () => {
      const input = "The psql database and mongo store";
      const entities = extractEntities(input);
      expect(entities).toContain("PostgreSQL");
      expect(entities).toContain("MongoDB");
    });

    it("should extract cloud providers", () => {
      const input = "Deploy to AWS with kubernetes clusters";
      const entities = extractEntities(input);
      expect(entities).toContain("AWS");
      expect(entities).toContain("Kubernetes");
    });

    it("should return empty array for no entities", () => {
      const input = "This is a simple sentence";
      const entities = extractEntities(input);
      expect(entities).toEqual([]);
    });

    it("should dedupe repeated entities", () => {
      const input = "React is great. I love React. React is the best.";
      const entities = extractEntities(input);
      const reactCount = entities.filter(e => e === "React").length;
      expect(reactCount).toBe(1);
    });
  });

  describe("extractReasoning", () => {
    it("should extract 'because' reasoning", () => {
      const input = "We chose TypeScript because it provides type safety";
      const reasoning = extractReasoning(input);
      expect(reasoning).toContain("type safety");
    });

    it("should extract 'since' reasoning", () => {
      const input = "Use caching since response times need to be fast";
      const reasoning = extractReasoning(input);
      expect(reasoning).toBeDefined();
      expect(reasoning).toContain("response times");
    });

    it("should extract 'due to' reasoning", () => {
      const input = "We refactored due to performance issues";
      const reasoning = extractReasoning(input);
      expect(reasoning).toBeDefined();
      expect(reasoning).toContain("performance");
    });

    it("should extract 'the reason is' reasoning", () => {
      const input = "The reason is better maintainability";
      const reasoning = extractReasoning(input);
      expect(reasoning).toBeDefined();
    });

    it("should return undefined for no reasoning", () => {
      const input = "TypeScript is a programming language";
      const reasoning = extractReasoning(input);
      expect(reasoning).toBeUndefined();
    });
  });

  describe("extractCoreStatement", () => {
    it("should remove reasoning clauses", () => {
      const input = "Use React for the frontend because it has great community support";
      const core = extractCoreStatement(input);
      expect(core).toBe("Use React for the frontend");
      expect(core).not.toContain("because");
    });

    it("should handle content without reasoning", () => {
      const input = "TypeScript provides type safety";
      const core = extractCoreStatement(input);
      expect(core).toBe("TypeScript provides type safety");
    });

    it("should handle empty string", () => {
      const core = extractCoreStatement("");
      expect(core).toBe("");
    });
  });

  describe("generateEmbeddingText", () => {
    it("should combine statement, reasoning, and entities", () => {
      const memory = {
        statement: "Use TypeScript",
        reasoning: "for type safety",
        entities: ["TypeScript"],
        keywords: [],
        timestamp: Date.now(),
        memoryType: "decision",
        layer: "long-term" as const,
        embeddingText: "",
      };
      
      const text = generateEmbeddingText(memory);
      expect(text).toContain("Use TypeScript");
      expect(text).toContain("Reason: for type safety");
      expect(text).toContain("Topics: TypeScript");
    });

    it("should handle minimal memory", () => {
      const memory = {
        statement: "Simple note",
        entities: [],
        keywords: [],
        timestamp: Date.now(),
        memoryType: "context",
        layer: "long-term" as const,
        embeddingText: "",
      };
      
      const text = generateEmbeddingText(memory);
      expect(text).toBe("Simple note");
    });
  });

  describe("preprocess", () => {
    it("should produce complete preprocessed memory", () => {
      const input = "We decided to use React because it has great component model";
      const result = preprocess(input);
      
      expect(result.statement).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.validFrom).toBeDefined();
      expect(result.entities).toContain("React");
      expect(result.embeddingText).toBeDefined();
      expect(result.layer).toBe("long-term");
    });

    it("should respect options", () => {
      const input = "Test memory";
      const result = preprocess(input, {
        layer: "foundational",
        context: "Test context",
        validFrom: 1000,
      });
      
      expect(result.layer).toBe("foundational");
      expect(result.context).toBe("Test context");
      expect(result.validFrom).toBe(1000);
    });

    it("should extract keywords", () => {
      const input = "Use PostgreSQL database with proper indexing strategies";
      const result = preprocess(input);
      
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords.some(k => k.includes("postgresql") || k.includes("database"))).toBe(true);
    });
  });

  describe("preprocessFoundational", () => {
    it("should mark as foundational layer", () => {
      const input = "I am an AI assistant";
      const result = preprocessFoundational(input, "identity");
      
      expect(result.layer).toBe("foundational");
      expect(result.memoryType).toBe("identity");
      expect(result.context).toContain("Foundational");
    });

    it("should prefix embedding text with category", () => {
      const input = "Write clean code";
      const result = preprocessFoundational(input, "goal");
      
      expect(result.embeddingText).toMatch(/^\[GOAL\]/);
    });

    it("should work for all categories", () => {
      const categories = ["identity", "goal", "value", "constraint"] as const;
      
      for (const cat of categories) {
        const result = preprocessFoundational("Test", cat);
        expect(result.memoryType).toBe(cat);
        expect(result.embeddingText).toContain(`[${cat.toUpperCase()}]`);
      }
    });
  });
});
