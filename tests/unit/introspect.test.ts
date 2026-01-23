/**
 * Tests for the introspection module - metacognition for the soul
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadManifest,
  clearManifestCache,
  extractCapabilities,
  analyzeGaps,
  hasCapability,
  getFeatureStatus,
  type CapabilitiesManifest,
  type Aspiration,
} from "../../src/introspect.js";

describe("introspect.ts", () => {
  beforeEach(() => {
    clearManifestCache();
  });

  describe("loadManifest", () => {
    it("should load the capabilities manifest from disk", () => {
      const manifest = loadManifest();
      
      expect(manifest).toBeDefined();
      expect(manifest.version).toBeDefined();
      expect(manifest.vessel.name).toBe("claude-memory-mcp");
    });

    it("should cache the manifest on subsequent calls", () => {
      const first = loadManifest();
      const second = loadManifest();
      
      expect(first).toBe(second); // Same object reference
    });

    it("should have required sections", () => {
      const manifest = loadManifest();
      
      expect(manifest.features).toBeDefined();
      expect(manifest.tools).toBeDefined();
      expect(manifest.modules).toBeDefined();
      expect(manifest.storage).toBeDefined();
    });
  });

  describe("extractCapabilities", () => {
    it("should categorize features by status", () => {
      const manifest = loadManifest();
      const caps = extractCapabilities(manifest);
      
      expect(caps.implementedFeatures).toContain("core_memory");
      expect(caps.implementedFeatures).toContain("temporal_reasoning");
      expect(caps.plannedFeatures).toContain("multi_instance_sync");
      expect(caps.plannedFeatures).toContain("http_transport");
    });

    it("should list implemented tools", () => {
      const manifest = loadManifest();
      const caps = extractCapabilities(manifest);
      
      expect(caps.tools).toContain("remember");
      expect(caps.tools).toContain("recall");
      expect(caps.tools).toContain("introspect");
    });

    it("should list implemented modules", () => {
      const manifest = loadManifest();
      const caps = extractCapabilities(manifest);
      
      expect(caps.modules).toContain("db");
      expect(caps.modules).toContain("intelligence");
      expect(caps.modules).toContain("introspect");
    });
  });

  describe("analyzeGaps", () => {
    const mockManifest: CapabilitiesManifest = {
      version: "1.0.0",
      lastUpdated: "2026-01-24",
      vessel: { name: "test", description: "test" },
      features: {
        "core_memory": { status: "implemented", description: "test" },
        "multi_instance_sync": { status: "planned", description: "test", plannedFor: "2.0.0" },
        "preference_inference": { status: "planned", description: "test", plannedFor: "2.0.0" },
      },
      tools: {},
      modules: {},
      storage: { vector_db: "test", embedding_model: "test", embedding_dimensions: 384 },
    };

    it("should identify gaps for planned features", () => {
      const aspirations: Aspiration[] = [
        {
          content: "The soul should sync across machines",
          source: "mem_123",
          category: "goals",
          keywords: ["sync"],
        },
      ];

      const gaps = analyzeGaps(aspirations, mockManifest);
      
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].relatedFeature).toBe("multi_instance_sync");
      expect(gaps[0].status).toBe("planned");
    });

    it("should identify gaps for preference inference", () => {
      const aspirations: Aspiration[] = [
        {
          content: "Learn from behavior patterns",
          source: "mem_456",
          category: "goals",
          keywords: ["learn", "preference"],
        },
      ];

      const gaps = analyzeGaps(aspirations, mockManifest);
      
      const inferenceGap = gaps.find(g => g.relatedFeature === "preference_inference");
      expect(inferenceGap).toBeDefined();
      expect(inferenceGap?.status).toBe("planned");
    });

    it("should not create gaps for implemented features", () => {
      const aspirations: Aspiration[] = [
        {
          content: "Remember things",
          source: "mem_789",
          category: "goals",
          keywords: [], // No keywords matching planned features
        },
      ];

      const gaps = analyzeGaps(aspirations, mockManifest);
      
      // No gaps for core_memory since it's implemented
      const coreGap = gaps.find(g => g.relatedFeature === "core_memory");
      expect(coreGap).toBeUndefined();
    });

    it("should sort gaps by confidence", () => {
      const aspirations: Aspiration[] = [
        { content: "Sync across machines", source: "m1", category: "goals", keywords: ["sync"] },
        { content: "Learn preferences", source: "m2", category: "goals", keywords: ["learn"] },
      ];

      const gaps = analyzeGaps(aspirations, mockManifest);
      
      // All should have confidence scores
      for (const gap of gaps) {
        expect(gap.confidence).toBeGreaterThan(0);
      }
      
      // Should be sorted descending
      for (let i = 1; i < gaps.length; i++) {
        expect(gaps[i].confidence).toBeLessThanOrEqual(gaps[i - 1].confidence);
      }
    });
  });

  describe("hasCapability", () => {
    it("should return true for implemented features", () => {
      expect(hasCapability("core_memory")).toBe(true);
      expect(hasCapability("temporal_reasoning")).toBe(true);
    });

    it("should return false for planned features", () => {
      expect(hasCapability("multi_instance_sync")).toBe(false);
      expect(hasCapability("http_transport")).toBe(false);
    });

    it("should return false for unknown features", () => {
      expect(hasCapability("nonexistent_feature")).toBe(false);
    });
  });

  describe("getFeatureStatus", () => {
    it("should return correct status for implemented features", () => {
      expect(getFeatureStatus("core_memory")).toBe("implemented");
      expect(getFeatureStatus("dream_states")).toBe("implemented");
    });

    it("should return correct status for planned features", () => {
      expect(getFeatureStatus("multi_instance_sync")).toBe("planned");
      expect(getFeatureStatus("preference_inference")).toBe("planned");
    });

    it("should return undefined for unknown features", () => {
      expect(getFeatureStatus("unknown_feature")).toBeUndefined();
    });
  });

  describe("manifest content validation", () => {
    it("should have consistent tool statuses", () => {
      const manifest = loadManifest();
      
      // All tools should have a status
      for (const [name, tool] of Object.entries(manifest.tools)) {
        expect(tool.status).toBeDefined();
        expect(["implemented", "partial", "planned", "deprecated"]).toContain(tool.status);
      }
    });

    it("should have storage configuration", () => {
      const manifest = loadManifest();
      
      expect(manifest.storage.vector_db).toBe("ChromaDB");
      expect(manifest.storage.embedding_model).toBe("all-MiniLM-L6-v2");
      expect(manifest.storage.embedding_dimensions).toBe(384);
    });

    it("should have version information", () => {
      const manifest = loadManifest();
      
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
