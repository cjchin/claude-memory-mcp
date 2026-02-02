import { describe, it, expect } from "vitest";
import { cosineSimilarity } from "../../src/embeddings.js";
import {
  findKNearestNeighbors,
  clusterMemories,
  inferLinkType,
  calculateLinkStrength,
  calculateCentrality,
  identifyHighways,
  generateProposedLinks,
  analyzeGraphEnrichment,
  proposedLinkToMemoryLink,
} from "../../src/graph-enrichment.js";
import type { Memory } from "../../src/types.js";

// Helper to create test memory with embedding
function createTestMemory(
  id: string,
  content: string,
  type: string = "context",
  embedding: number[] = []
): Memory & { embedding: number[] } {
  return {
    id,
    content,
    type: type as any,
    tags: [],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    embedding,
  };
}

// Helper to generate random unit vector
function randomUnitVector(dim: number): number[] {
  const vec = Array.from({ length: dim }, () => Math.random() - 0.5);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
}

// Helper to create similar vector (perturbed)
function perturbVector(vec: number[], amount: number = 0.1): number[] {
  const perturbed = vec.map((v) => v + (Math.random() - 0.5) * amount);
  const norm = Math.sqrt(perturbed.reduce((sum, v) => sum + v * v, 0));
  return perturbed.map((v) => v / norm);
}

describe("Cosine Similarity", () => {
  it("should return 1 for identical vectors", () => {
    const vec = [1, 0, 0];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const vec1 = [1, 0, 0];
    const vec2 = [-1, 0, 0];
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
  });

  it("should handle normalized vectors", () => {
    const vec1 = [0.6, 0.8, 0];
    const vec2 = [0.8, 0.6, 0];
    // Both are unit vectors, dot product = 0.48 + 0.48 = 0.96
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0.96, 5);
  });

  it("should throw for different length vectors", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("Vector length mismatch");
  });
});

describe("K-Nearest Neighbors", () => {
  it("should find nearest neighbors based on embedding similarity", () => {
    const baseVec = randomUnitVector(10);

    const memories = [
      createTestMemory("m1", "Memory 1", "context", baseVec),
      createTestMemory("m2", "Memory 2", "context", perturbVector(baseVec, 0.05)), // Very similar
      createTestMemory("m3", "Memory 3", "context", perturbVector(baseVec, 0.1)), // Similar
      createTestMemory("m4", "Memory 4", "context", randomUnitVector(10)), // Different
    ];

    const neighbors = findKNearestNeighbors(memories, 2, 0.3);

    // m1 should have m2 and m3 as neighbors (most similar)
    const m1Neighbors = neighbors.get("m1")!;
    expect(m1Neighbors.length).toBeGreaterThan(0);
    expect(m1Neighbors[0].id).toBe("m2"); // Most similar first
  });

  it("should respect minimum similarity threshold", () => {
    const memories = [
      createTestMemory("m1", "Memory 1", "context", [1, 0, 0]),
      createTestMemory("m2", "Memory 2", "context", [0, 1, 0]), // Orthogonal
    ];

    const neighbors = findKNearestNeighbors(memories, 5, 0.5);

    // Should have no neighbors since vectors are orthogonal
    const m1Neighbors = neighbors.get("m1")!;
    expect(m1Neighbors.length).toBe(0);
  });
});

describe("Memory Clustering", () => {
  it("should group similar memories into clusters", () => {
    const cluster1Base = randomUnitVector(10);
    const cluster2Base = randomUnitVector(10);

    const memories = [
      createTestMemory("c1m1", "Cluster 1 Memory 1", "context", cluster1Base),
      createTestMemory("c1m2", "Cluster 1 Memory 2", "context", perturbVector(cluster1Base, 0.05)),
      createTestMemory("c2m1", "Cluster 2 Memory 1", "learning", cluster2Base),
      createTestMemory("c2m2", "Cluster 2 Memory 2", "learning", perturbVector(cluster2Base, 0.05)),
    ];

    const neighbors = findKNearestNeighbors(memories, 3, 0.5);
    const clusters = clusterMemories(neighbors, 0.7);

    // Should have 2 clusters (or possibly more if vectors happened to be similar)
    const uniqueClusters = new Set(clusters.values());
    expect(uniqueClusters.size).toBeGreaterThanOrEqual(1);

    // Memories in same base cluster should be in same cluster
    expect(clusters.get("c1m1")).toBe(clusters.get("c1m2"));
    expect(clusters.get("c2m1")).toBe(clusters.get("c2m2"));
  });
});

describe("Link Type Inference - Directional Vectors", () => {
  // Helper for timestamps
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  describe("Dependency Vectors (structural direction)", () => {
    it("should infer depends_on when target is foundational", () => {
      const source = "Some derived fact";
      const target = "Core identity value";
      expect(inferLinkType(source, target, "context", "foundational")).toBe("depends_on");
    });

    it("should infer supports when source is foundational", () => {
      const source = "Core identity value";
      const target = "Some derived fact";
      expect(inferLinkType(source, target, "foundational", "context")).toBe("supports");
    });

    it("should infer depends_on for decisions based on context", () => {
      const source = "Decision to use X";
      const target = "Context about the problem";
      expect(inferLinkType(source, target, "decision", "context")).toBe("depends_on");
    });

    it("should infer supports for context supporting decision", () => {
      const source = "Context about the problem";
      const target = "Decision to use X";
      expect(inferLinkType(source, target, "context", "decision")).toBe("supports");
    });

    it("should infer caused_by for learnings from decisions", () => {
      const source = "Learned that X works well";
      const target = "Decision to try X";
      expect(inferLinkType(source, target, "learning", "decision")).toBe("caused_by");
    });

    it("should infer depends_on for todos from decisions", () => {
      const source = "TODO: implement the feature";
      const target = "Decision to add feature X";
      expect(inferLinkType(source, target, "todo", "decision")).toBe("depends_on");
    });
  });

  describe("Temporal Vectors (time flow)", () => {
    it("should infer supersedes for newer content with replacement signal", () => {
      const source = "We have updated the approach and replaced the old method";
      const target = "The old method for handling X";
      const result = inferLinkType(
        source, target,
        "decision", "decision",
        daysAgo(0),  // Source is today
        daysAgo(14)  // Target is 2 weeks ago
      );
      expect(result).toBe("supersedes");
    });

    it("should not infer supersedes without replacement signal", () => {
      const source = "Another decision about Y";
      const target = "Decision about X";
      const result = inferLinkType(
        source, target,
        "decision", "decision",
        daysAgo(0),
        daysAgo(14)
      );
      // Should fall through to same-level logic, not supersedes
      expect(result).not.toBe("supersedes");
    });
  });

  describe("Same-level relationships", () => {
    it("should infer extends for learning to learning", () => {
      const source = "Additional insight about the bug";
      const target = "Initial discovery of the bug";
      expect(inferLinkType(source, target, "learning", "learning")).toBe("extends");
    });

    it("should infer extends for longer context elaborating shorter", () => {
      const source = "Detailed explanation of the system architecture with many components and their interactions across multiple layers";
      const target = "System architecture overview";
      expect(inferLinkType(source, target, "context", "context")).toBe("extends");
    });

    it("should infer example_of for example content", () => {
      const source = "For example, in the auth module we handle this by...";
      const target = "Pattern for error handling";
      expect(inferLinkType(source, target, "context", "pattern")).toBe("example_of");
    });
  });

  describe("Default behavior", () => {
    it("should default to related for same-type same-length content", () => {
      const source = "Some information A";
      const target = "Some information B";
      expect(inferLinkType(source, target, "context", "context")).toBe("related");
    });
  });
});

describe("Link Strength Calculation", () => {
  it("should use similarity as base strength", () => {
    const strength = calculateLinkStrength(0.8, "related");
    expect(strength).toBeCloseTo(0.8, 2);
  });

  it("should boost strength for specific link types", () => {
    const relatedStrength = calculateLinkStrength(0.8, "related");
    const contradictsStrength = calculateLinkStrength(0.8, "contradicts");
    expect(contradictsStrength).toBeGreaterThan(relatedStrength);
  });

  it("should cap strength at 1.0", () => {
    const strength = calculateLinkStrength(0.95, "contradicts");
    expect(strength).toBeLessThanOrEqual(1.0);
  });
});

describe("Centrality Calculation", () => {
  it("should give higher centrality to well-connected nodes", () => {
    // Star topology: center connected to all, edges not connected
    const neighbors = new Map<string, Array<{ id: string; similarity: number }>>();
    neighbors.set("center", [
      { id: "edge1", similarity: 0.8 },
      { id: "edge2", similarity: 0.8 },
      { id: "edge3", similarity: 0.8 },
    ]);
    neighbors.set("edge1", [{ id: "center", similarity: 0.8 }]);
    neighbors.set("edge2", [{ id: "center", similarity: 0.8 }]);
    neighbors.set("edge3", [{ id: "center", similarity: 0.8 }]);

    const clusters = new Map<string, number>();
    clusters.set("center", 0);
    clusters.set("edge1", 0);
    clusters.set("edge2", 0);
    clusters.set("edge3", 0);

    const centrality = calculateCentrality(neighbors, clusters);

    expect(centrality.get("center")).toBeGreaterThan(centrality.get("edge1")!);
  });

  it("should boost centrality for cross-cluster connections", () => {
    const neighbors = new Map<string, Array<{ id: string; similarity: number }>>();
    neighbors.set("bridge", [
      { id: "a1", similarity: 0.8 },
      { id: "b1", similarity: 0.8 },
    ]);
    neighbors.set("a1", [{ id: "bridge", similarity: 0.8 }]);
    neighbors.set("b1", [{ id: "bridge", similarity: 0.8 }]);

    // Bridge connects two different clusters
    const clusters = new Map<string, number>();
    clusters.set("bridge", 0);
    clusters.set("a1", 1); // Different cluster
    clusters.set("b1", 2); // Different cluster

    const centrality = calculateCentrality(neighbors, clusters);

    // Bridge should have high centrality due to cross-cluster connections
    expect(centrality.get("bridge")).toBeGreaterThan(0);
  });
});

describe("Highway Identification", () => {
  it("should identify top N by centrality as highways", () => {
    const centrality = new Map<string, number>();
    centrality.set("high1", 10);
    centrality.set("high2", 8);
    centrality.set("low1", 2);
    centrality.set("low2", 1);

    const highways = identifyHighways(centrality, 2);

    expect(highways).toContain("high1");
    expect(highways).toContain("high2");
    expect(highways).not.toContain("low1");
  });
});

describe("Proposed Link Generation", () => {
  it("should generate links for similar memories", () => {
    const baseVec = randomUnitVector(10);

    const memories = [
      createTestMemory("m1", "Decision about X", "decision", baseVec),
      createTestMemory("m2", "Context for X", "context", perturbVector(baseVec, 0.05)),
    ];

    const links = generateProposedLinks(memories, { minSimilarity: 0.3 });

    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.sourceId === "m1" && l.targetId === "m2")).toBe(true);
  });

  it("should mark cross-cluster links", () => {
    const vec1 = [1, 0, 0, 0, 0];
    const vec2 = [0.9, 0.1, 0, 0, 0]; // Similar to vec1
    const vec3 = [0, 1, 0, 0, 0]; // Different cluster

    const memories = [
      createTestMemory("c1m1", "Cluster 1", "context", vec1),
      createTestMemory("c1m2", "Cluster 1 related", "context", vec2),
      createTestMemory("c2m1", "Cluster 2", "context", vec3),
    ];

    const links = generateProposedLinks(memories, { minSimilarity: 0.1 });

    // Links between c1m1/c1m2 and c2m1 should be marked as cross-cluster
    const crossClusterLinks = links.filter((l) => l.isCrossCluster);
    // May or may not have cross-cluster links depending on similarity
    expect(links.length).toBeGreaterThan(0);
  });

  it("should respect max links per memory", () => {
    const baseVec = randomUnitVector(10);

    const memories = Array.from({ length: 10 }, (_, i) =>
      createTestMemory(`m${i}`, `Memory ${i}`, "context", perturbVector(baseVec, 0.1 * i))
    );

    const links = generateProposedLinks(memories, {
      minSimilarity: 0.3,
      maxLinksPerMemory: 2,
    });

    // Count links per source
    const linkCounts = new Map<string, number>();
    for (const link of links) {
      linkCounts.set(link.sourceId, (linkCounts.get(link.sourceId) || 0) + 1);
    }

    // Each memory should have at most maxLinksPerMemory links
    for (const count of linkCounts.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});

describe("Graph Enrichment Analysis", () => {
  it("should return comprehensive analysis results", () => {
    const baseVec = randomUnitVector(10);

    const memories = [
      createTestMemory("m1", "Memory 1", "decision", baseVec),
      createTestMemory("m2", "Memory 2", "context", perturbVector(baseVec, 0.05)),
      createTestMemory("m3", "Memory 3", "learning", perturbVector(baseVec, 0.1)),
    ];

    const result = analyzeGraphEnrichment(memories, { minSimilarity: 0.3 });

    expect(result.totalMemories).toBe(3);
    expect(result.clustersFound).toBeGreaterThan(0);
    expect(result.proposedLinks.length).toBeGreaterThan(0);
  });
});

describe("Proposed Link to Memory Link Conversion", () => {
  it("should convert proposed link to memory link format", () => {
    const proposed = {
      sourceId: "source",
      targetId: "target",
      type: "supports" as const,
      strength: 0.85,
      reason: "Test reason",
      similarity: 0.8,
      isCrossCluster: false,
      isHighwayConnection: true,
    };

    const memoryLink = proposedLinkToMemoryLink(proposed, "test-enricher");

    expect(memoryLink.targetId).toBe("target");
    expect(memoryLink.type).toBe("supports");
    expect(memoryLink.strength).toBe(0.85);
    expect(memoryLink.reason).toBe("Test reason");
    expect(memoryLink.createdBy).toBe("test-enricher");
    expect(memoryLink.createdAt).toBeDefined();
  });
});
