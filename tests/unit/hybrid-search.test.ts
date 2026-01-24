import { describe, it, expect } from "vitest";
import {
  tokenize,
  calculateIDF,
  bm25Score,
  rankWithBM25,
  buildGraph,
  traverseGraph,
  graphDistanceBoost,
  hybridScore,
  expandWithGraphNeighbors,
} from "../../src/hybrid-search.js";
import type { Memory } from "../../src/types.js";

// Helper to create test memories
function createMemory(id: string, content: string, relatedMemories?: string[]): Memory {
  return {
    id,
    content,
    type: "context",
    tags: [],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    related_memories: relatedMemories,
  };
}

describe("Tokenization", () => {
  it("should tokenize text into lowercase terms", () => {
    const tokens = tokenize("Hello World");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("should remove punctuation", () => {
    const tokens = tokenize("Hello, World! How are you?");
    expect(tokens).not.toContain(",");
    expect(tokens).not.toContain("!");
    expect(tokens).not.toContain("?");
  });

  it("should remove stop words", () => {
    const tokens = tokenize("The quick brown fox jumps over the lazy dog");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("over");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("should remove single character tokens", () => {
    const tokens = tokenize("I am a developer");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("developer");
  });

  it("should handle empty string", () => {
    const tokens = tokenize("");
    expect(tokens).toEqual([]);
  });

  it("should handle technical terms", () => {
    const tokens = tokenize("AGM800 EtherCAT FPGA implementation");
    expect(tokens).toContain("agm800");
    expect(tokens).toContain("ethercat");
    expect(tokens).toContain("fpga");
    expect(tokens).toContain("implementation");
  });
});

describe("IDF Calculation", () => {
  it("should calculate higher IDF for rare terms", () => {
    const documents = [
      "the quick brown fox",
      "the lazy dog",
      "quick quick fox",
    ];
    const terms = new Set(["quick", "lazy", "brown"]);
    const idf = calculateIDF(documents, terms);

    // "lazy" appears in 1 doc, should have higher IDF
    // "quick" appears in 2 docs, should have lower IDF
    expect(idf.get("lazy")).toBeGreaterThan(idf.get("quick")!);
  });

  it("should return 0 for terms in all documents", () => {
    const documents = ["fox jumps", "fox runs", "fox sleeps"];
    const terms = new Set(["fox"]);
    const idf = calculateIDF(documents, terms);

    // Term in all docs has very low IDF
    expect(idf.get("fox")).toBeLessThan(0.5);
  });
});

describe("BM25 Score", () => {
  it("should score higher for exact matches", () => {
    const queryTerms = ["ethercat", "fpga"];
    const doc1Terms = ["ethercat", "fpga", "implementation"];
    const doc2Terms = ["motor", "control", "drive"];

    const idfMap = new Map([
      ["ethercat", 2.0],
      ["fpga", 1.5],
    ]);

    const score1 = bm25Score(queryTerms, doc1Terms, idfMap, 3);
    const score2 = bm25Score(queryTerms, doc2Terms, idfMap, 3);

    expect(score1).toBeGreaterThan(score2);
    expect(score2).toBe(0); // No matching terms
  });

  it("should handle repeated terms with saturation", () => {
    const queryTerms = ["fpga"];
    const doc1Terms = ["fpga"];
    const doc2Terms = ["fpga", "fpga", "fpga", "fpga", "fpga"];

    const idfMap = new Map([["fpga", 1.0]]);

    const score1 = bm25Score(queryTerms, doc1Terms, idfMap, 3);
    const score2 = bm25Score(queryTerms, doc2Terms, idfMap, 3);

    // Score should increase but with diminishing returns
    expect(score2).toBeGreaterThan(score1);
    expect(score2).toBeLessThan(score1 * 5); // Not 5x despite 5x terms
  });
});

describe("rankWithBM25", () => {
  it("should rank memories by BM25 score", () => {
    const memories: Memory[] = [
      createMemory("1", "EtherCAT implementation on FPGA"),
      createMemory("2", "Motor control basics"),
      createMemory("3", "FPGA programming guide"),
    ];

    const scores = rankWithBM25("FPGA EtherCAT", memories);

    expect(scores.get("1")).toBeGreaterThan(scores.get("2")!);
    expect(scores.get("1")).toBeGreaterThan(scores.get("3")!);
    expect(scores.get("3")).toBeGreaterThan(scores.get("2")!);
  });

  it("should handle empty query", () => {
    const memories: Memory[] = [createMemory("1", "test content")];
    const scores = rankWithBM25("", memories);
    expect(scores.size).toBe(0);
  });

  it("should handle empty memories", () => {
    const scores = rankWithBM25("test query", []);
    expect(scores.size).toBe(0);
  });
});

describe("Graph Building", () => {
  it("should build bidirectional graph from related_memories", () => {
    const memories: Memory[] = [
      createMemory("A", "Memory A", ["B", "C"]),
      createMemory("B", "Memory B", ["A"]),
      createMemory("C", "Memory C"),
    ];

    const graph = buildGraph(memories);

    expect(graph.get("A")).toContain("B");
    expect(graph.get("A")).toContain("C");
    expect(graph.get("B")).toContain("A");
    expect(graph.get("C")).toContain("A"); // Bidirectional
  });

  it("should handle memories with no links", () => {
    const memories: Memory[] = [
      createMemory("A", "Memory A"),
      createMemory("B", "Memory B"),
    ];

    const graph = buildGraph(memories);

    expect(graph.get("A")?.size).toBe(0);
    expect(graph.get("B")?.size).toBe(0);
  });
});

describe("Graph Traversal", () => {
  it("should find nodes within max distance", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["A", "C"])],
      ["C", new Set(["B", "D"])],
      ["D", new Set(["C"])],
    ]);

    const distances = traverseGraph(["A"], graph, 2);

    expect(distances.get("A")).toBe(0);
    expect(distances.get("B")).toBe(1);
    expect(distances.get("C")).toBe(2);
    expect(distances.has("D")).toBe(false); // Beyond max distance
  });

  it("should find shortest path when multiple paths exist", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B", "C"])],
      ["B", new Set(["A", "D"])],
      ["C", new Set(["A", "D"])],
      ["D", new Set(["B", "C"])],
    ]);

    // D is reachable via A->B->D or A->C->D
    const distances = traverseGraph(["A"], graph, 3);

    expect(distances.get("D")).toBe(2);
  });

  it("should handle multiple seed nodes", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["C"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A", "B"])],
    ]);

    const distances = traverseGraph(["A", "B"], graph, 2);

    expect(distances.get("A")).toBe(0);
    expect(distances.get("B")).toBe(0);
    expect(distances.get("C")).toBe(1);
  });
});

describe("Graph Distance Boost", () => {
  it("should give no boost to direct matches (distance 0)", () => {
    expect(graphDistanceBoost(0)).toBe(0);
  });

  it("should give max boost to distance 1", () => {
    expect(graphDistanceBoost(1, 2, 0.3)).toBe(0.3);
  });

  it("should decay boost with distance", () => {
    const boost1 = graphDistanceBoost(1, 3, 0.3);
    const boost2 = graphDistanceBoost(2, 3, 0.3);
    const boost3 = graphDistanceBoost(3, 3, 0.3);

    expect(boost1).toBeGreaterThan(boost2);
    expect(boost2).toBeGreaterThan(boost3);
  });

  it("should give no boost beyond max distance", () => {
    expect(graphDistanceBoost(5, 2, 0.3)).toBe(0);
  });
});

describe("Hybrid Scoring", () => {
  it("should combine semantic, BM25, and graph scores", () => {
    const memories: Array<Memory & { score: number }> = [
      { ...createMemory("1", "FPGA EtherCAT implementation"), score: 0.9 },
      { ...createMemory("2", "Motor control basics"), score: 0.7 },
      { ...createMemory("3", "FPGA programming guide"), score: 0.8 },
    ];

    const allMemories: Memory[] = [
      createMemory("1", "FPGA EtherCAT implementation", ["3"]),
      createMemory("2", "Motor control basics"),
      createMemory("3", "FPGA programming guide", ["1"]),
    ];

    const results = hybridScore(memories, "FPGA EtherCAT", allMemories);

    // Memory 1 should still be top (best semantic + best BM25)
    expect(results[0].id).toBe("1");

    // All results should have hybrid scores
    for (const r of results) {
      expect(r.semanticScore).toBeDefined();
      expect(r.bm25Score).toBeDefined();
      expect(r.graphBoost).toBeDefined();
    }
  });

  it("should respect weight configuration", () => {
    const memories: Array<Memory & { score: number }> = [
      { ...createMemory("1", "exact match keywords"), score: 0.5 },
      { ...createMemory("2", "semantically similar content"), score: 0.9 },
    ];

    // With high BM25 weight, keyword match should win
    const bm25Heavy = hybridScore(memories, "exact match keywords", memories, {
      semanticWeight: 0.2,
      bm25Weight: 0.7,
      graphWeight: 0.1,
      graphMaxDistance: 2,
    });

    // With high semantic weight, semantic match should win
    const semanticHeavy = hybridScore(memories, "exact match keywords", memories, {
      semanticWeight: 0.7,
      bm25Weight: 0.2,
      graphWeight: 0.1,
      graphMaxDistance: 2,
    });

    // Different weighting should produce different rankings
    expect(bm25Heavy[0].id).toBe("1");
    expect(semanticHeavy[0].id).toBe("2");
  });
});

describe("Graph Expansion", () => {
  it("should find neighbors not in search results", () => {
    const searchResults: Memory[] = [
      createMemory("1", "Search result", ["2", "3"]),
    ];

    const allMemories: Memory[] = [
      createMemory("1", "Search result", ["2", "3"]),
      createMemory("2", "Neighbor A", ["1"]),
      createMemory("3", "Neighbor B", ["1"]),
      createMemory("4", "Unrelated"),
    ];

    const neighbors = expandWithGraphNeighbors(searchResults, allMemories, 5, 1);

    expect(neighbors.length).toBe(2);
    expect(neighbors.map((n) => n.id)).toContain("2");
    expect(neighbors.map((n) => n.id)).toContain("3");
    expect(neighbors.map((n) => n.id)).not.toContain("1"); // Already in results
    expect(neighbors.map((n) => n.id)).not.toContain("4"); // Not connected
  });

  it("should respect expansion limit", () => {
    const searchResults: Memory[] = [
      createMemory("1", "Search result", ["2", "3", "4", "5"]),
    ];

    const allMemories: Memory[] = [
      createMemory("1", "Search result", ["2", "3", "4", "5"]),
      createMemory("2", "Neighbor A", ["1"]),
      createMemory("3", "Neighbor B", ["1"]),
      createMemory("4", "Neighbor C", ["1"]),
      createMemory("5", "Neighbor D", ["1"]),
    ];

    const neighbors = expandWithGraphNeighbors(searchResults, allMemories, 2, 1);

    expect(neighbors.length).toBe(2);
  });

  it("should handle no neighbors", () => {
    const searchResults: Memory[] = [
      createMemory("1", "Isolated memory"),
    ];

    const allMemories: Memory[] = [
      createMemory("1", "Isolated memory"),
      createMemory("2", "Other memory"),
    ];

    const neighbors = expandWithGraphNeighbors(searchResults, allMemories, 5, 1);

    expect(neighbors.length).toBe(0);
  });
});
