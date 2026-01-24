/**
 * Hybrid Search Module
 * Combines semantic (vector) search with BM25 keyword search and graph traversal
 * Inspired by Graphiti's hybrid retrieval approach
 */

import type { Memory } from "./types.js";

// ============ BM25 IMPLEMENTATION ============

interface BM25Config {
  k1: number;  // Term frequency saturation parameter (typically 1.2-2.0)
  b: number;   // Length normalization parameter (typically 0.75)
}

const DEFAULT_BM25_CONFIG: BM25Config = {
  k1: 1.5,
  b: 0.75,
};

/**
 * Tokenize text into terms for BM25
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")  // Remove punctuation
    .split(/\s+/)
    .filter((term) => term.length > 1)  // Remove single chars
    .filter((term) => !STOP_WORDS.has(term));
}

/**
 * Common English stop words to filter out
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "it", "its", "this", "that", "these", "those", "i", "you", "he",
  "she", "we", "they", "what", "which", "who", "whom", "when", "where",
  "why", "how", "all", "each", "every", "both", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
  "than", "too", "very", "just", "also", "now", "here", "there", "then",
  "over", "under", "again", "further", "once", "into", "through", "during",
  "before", "after", "above", "below", "up", "down", "out", "off", "about",
]);

/**
 * Calculate IDF (Inverse Document Frequency) for terms across a corpus
 */
export function calculateIDF(
  documents: string[],
  terms: Set<string>
): Map<string, number> {
  const N = documents.length;
  const idfMap = new Map<string, number>();

  for (const term of terms) {
    // Count documents containing this term
    let df = 0;
    for (const doc of documents) {
      if (tokenize(doc).includes(term)) {
        df++;
      }
    }
    // IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    idfMap.set(term, idf);
  }

  return idfMap;
}

/**
 * Calculate BM25 score for a document against a query
 */
export function bm25Score(
  queryTerms: string[],
  documentTerms: string[],
  idfMap: Map<string, number>,
  avgDocLength: number,
  config: BM25Config = DEFAULT_BM25_CONFIG
): number {
  const { k1, b } = config;
  const docLength = documentTerms.length;
  let score = 0;

  // Count term frequencies in document
  const termFreq = new Map<string, number>();
  for (const term of documentTerms) {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  }

  for (const queryTerm of queryTerms) {
    const tf = termFreq.get(queryTerm) || 0;
    if (tf === 0) continue;

    const idf = idfMap.get(queryTerm) || 0;

    // BM25 formula
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));

    score += idf * (numerator / denominator);
  }

  return score;
}

/**
 * Rank memories using BM25
 */
export function rankWithBM25(
  query: string,
  memories: Memory[]
): Map<string, number> {
  const queryTerms = tokenize(query);
  const scores = new Map<string, number>();

  if (queryTerms.length === 0 || memories.length === 0) {
    return scores;
  }

  // Tokenize all documents
  const documentTerms = memories.map((m) => tokenize(m.content));
  const allDocuments = memories.map((m) => m.content);

  // Calculate average document length
  const avgDocLength =
    documentTerms.reduce((sum, terms) => sum + terms.length, 0) / memories.length;

  // Get all unique terms from query
  const queryTermSet = new Set(queryTerms);

  // Calculate IDF
  const idfMap = calculateIDF(allDocuments, queryTermSet);

  // Score each document
  for (let i = 0; i < memories.length; i++) {
    const score = bm25Score(queryTerms, documentTerms[i], idfMap, avgDocLength);
    scores.set(memories[i].id, score);
  }

  return scores;
}

// ============ GRAPH TRAVERSAL ============

interface GraphNode {
  memory: Memory;
  distance: number;  // Distance from query result (0 = direct match)
}

/**
 * Build adjacency list from memories' related_memories links
 */
export function buildGraph(memories: Memory[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const memory of memories) {
    if (!graph.has(memory.id)) {
      graph.set(memory.id, new Set());
    }

    // Add edges for related memories (bidirectional)
    if (memory.related_memories?.length) {
      for (const relatedId of memory.related_memories) {
        graph.get(memory.id)!.add(relatedId);

        // Ensure bidirectional
        if (!graph.has(relatedId)) {
          graph.set(relatedId, new Set());
        }
        graph.get(relatedId)!.add(memory.id);
      }
    }
  }

  return graph;
}

/**
 * Traverse graph from seed nodes, returning nodes within maxDistance
 */
export function traverseGraph(
  seedIds: string[],
  graph: Map<string, Set<string>>,
  maxDistance: number = 2
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ id: string; distance: number }> = [];

  // Initialize with seed nodes at distance 0
  for (const seedId of seedIds) {
    distances.set(seedId, 0);
    queue.push({ id: seedId, distance: 0 });
  }

  // BFS traversal
  while (queue.length > 0) {
    const { id, distance } = queue.shift()!;

    if (distance >= maxDistance) continue;

    const neighbors = graph.get(id);
    if (!neighbors) continue;

    for (const neighborId of neighbors) {
      const currentDistance = distances.get(neighborId);
      const newDistance = distance + 1;

      // Only update if this is a shorter path
      if (currentDistance === undefined || newDistance < currentDistance) {
        distances.set(neighborId, newDistance);
        queue.push({ id: neighborId, distance: newDistance });
      }
    }
  }

  return distances;
}

/**
 * Calculate graph distance boost for a memory
 * Closer memories get higher boost
 */
export function graphDistanceBoost(
  distance: number,
  maxDistance: number = 2,
  maxBoost: number = 0.3
): number {
  if (distance === 0) return 0;  // No boost for direct matches
  if (distance > maxDistance) return 0;

  // Linear decay: distance 1 gets maxBoost, distance 2 gets maxBoost/2, etc.
  return maxBoost / distance;
}

// ============ HYBRID SCORING ============

export interface HybridSearchConfig {
  semanticWeight: number;   // Weight for vector similarity (0-1)
  bm25Weight: number;       // Weight for BM25 score (0-1)
  graphWeight: number;      // Weight for graph proximity (0-1)
  graphMaxDistance: number; // Max hops in graph traversal
}

const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  semanticWeight: 0.6,
  bm25Weight: 0.3,
  graphWeight: 0.1,
  graphMaxDistance: 2,
};

export interface ScoredMemory extends Memory {
  score: number;
  semanticScore: number;
  bm25Score: number;
  graphBoost: number;
  graphDistance?: number;
}

/**
 * Combine semantic, BM25, and graph scores into final ranking
 */
export function hybridScore(
  memories: Array<Memory & { score: number }>,  // Memories with semantic scores
  query: string,
  allMemories: Memory[],  // Full corpus for graph
  config: HybridSearchConfig = DEFAULT_HYBRID_CONFIG
): ScoredMemory[] {
  const { semanticWeight, bm25Weight, graphWeight, graphMaxDistance } = config;

  // Normalize weights
  const totalWeight = semanticWeight + bm25Weight + graphWeight;
  const normSemantic = semanticWeight / totalWeight;
  const normBM25 = bm25Weight / totalWeight;
  const normGraph = graphWeight / totalWeight;

  // Calculate BM25 scores
  const bm25Scores = rankWithBM25(query, memories);

  // Normalize BM25 scores to 0-1 range
  const maxBM25 = Math.max(...bm25Scores.values(), 0.001);
  for (const [id, score] of bm25Scores) {
    bm25Scores.set(id, score / maxBM25);
  }

  // Build graph and calculate distances
  const graph = buildGraph(allMemories);
  const seedIds = memories.slice(0, 5).map((m) => m.id);  // Top 5 as seeds
  const graphDistances = traverseGraph(seedIds, graph, graphMaxDistance);

  // Combine scores
  const results: ScoredMemory[] = memories.map((memory) => {
    const semanticScore = memory.score;
    const bm25 = bm25Scores.get(memory.id) || 0;
    const distance = graphDistances.get(memory.id);
    const graphBoost = distance !== undefined ? graphDistanceBoost(distance, graphMaxDistance) : 0;

    const combinedScore =
      normSemantic * semanticScore +
      normBM25 * bm25 +
      normGraph * graphBoost;

    return {
      ...memory,
      score: combinedScore,
      semanticScore,
      bm25Score: bm25,
      graphBoost,
      graphDistance: distance,
    };
  });

  // Sort by combined score
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Expand search results with graph neighbors
 * Returns additional memories connected to the search results
 */
export function expandWithGraphNeighbors(
  searchResults: Memory[],
  allMemories: Memory[],
  maxExpansion: number = 5,
  maxDistance: number = 1
): Memory[] {
  const resultIds = new Set(searchResults.map((m) => m.id));
  const graph = buildGraph(allMemories);
  const seedIds = searchResults.map((m) => m.id);
  const distances = traverseGraph(seedIds, graph, maxDistance);

  // Find neighbors not already in results
  const neighbors: Array<{ memory: Memory; distance: number }> = [];
  const memoryMap = new Map(allMemories.map((m) => [m.id, m]));

  for (const [id, distance] of distances) {
    if (resultIds.has(id)) continue;  // Skip if already in results
    if (distance === 0) continue;      // Skip seed nodes

    const memory = memoryMap.get(id);
    if (memory) {
      neighbors.push({ memory, distance });
    }
  }

  // Sort by distance (closer first), then limit
  neighbors.sort((a, b) => a.distance - b.distance);
  return neighbors.slice(0, maxExpansion).map((n) => n.memory);
}
