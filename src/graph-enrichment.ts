/**
 * Graph Enrichment Module
 *
 * Enriches the memory graph by:
 * 1. Discovering semantic clusters (localities)
 * 2. Creating directional links between related memories
 * 3. Establishing "highways" - central nodes that bridge clusters
 *
 * Inspired by Knowledge Graph construction and the user's "thought potential" model:
 * - Localities: Dense clusters of related memories
 * - Adjacentness: Connections that enable thought flow
 * - Highways: High-traffic paths between distant concepts
 * - Directionality: Links have direction like KG edges
 */

import type { Memory, MemoryLink, LinkType } from "./types.js";

// ============ SIMILARITY & CLUSTERING ============

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Find k-nearest neighbors for each memory based on embeddings
 */
export function findKNearestNeighbors(
  memories: Array<{ id: string; embedding: number[] }>,
  k: number = 5,
  minSimilarity: number = 0.5
): Map<string, Array<{ id: string; similarity: number }>> {
  const neighbors = new Map<string, Array<{ id: string; similarity: number }>>();

  for (let i = 0; i < memories.length; i++) {
    const current = memories[i];
    const similarities: Array<{ id: string; similarity: number }> = [];

    for (let j = 0; j < memories.length; j++) {
      if (i === j) continue;

      const sim = cosineSimilarity(current.embedding, memories[j].embedding);
      if (sim >= minSimilarity) {
        similarities.push({ id: memories[j].id, similarity: sim });
      }
    }

    // Sort by similarity and take top k
    similarities.sort((a, b) => b.similarity - a.similarity);
    neighbors.set(current.id, similarities.slice(0, k));
  }

  return neighbors;
}

/**
 * Simple clustering using connected components with similarity threshold
 */
export function clusterMemories(
  neighbors: Map<string, Array<{ id: string; similarity: number }>>,
  minSimilarity: number = 0.6
): Map<string, number> {
  const clusters = new Map<string, number>();
  const visited = new Set<string>();
  let clusterId = 0;

  function dfs(nodeId: string, cluster: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    clusters.set(nodeId, cluster);

    const nodeNeighbors = neighbors.get(nodeId) || [];
    for (const neighbor of nodeNeighbors) {
      if (neighbor.similarity >= minSimilarity && !visited.has(neighbor.id)) {
        dfs(neighbor.id, cluster);
      }
    }
  }

  // Start DFS from each unvisited node
  for (const nodeId of neighbors.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, clusterId);
      clusterId++;
    }
  }

  return clusters;
}

// ============ LINK TYPE INFERENCE ============

// ============ DIRECTIONAL VECTOR INFERENCE ============

/**
 * Links encode two types of directional vectors:
 *
 * 1. TEMPORAL VECTORS (time flow):
 *    - supersedes: source is newer, replaces target
 *    - caused_by: source resulted from target (target → source in time)
 *    - extends: source builds on target (target came first)
 *
 * 2. DEPENDENCY VECTORS (structural direction):
 *    - depends_on: source requires target to make sense
 *    - supports: source provides evidence/foundation for target
 *    - implements: source is concrete realization of target
 *    - example_of: source is instance of target pattern
 *
 * 3. CONFLICT VECTORS (tension):
 *    - contradicts: source conflicts with target (needs resolution)
 *
 * The direction matters: A --[depends_on]--> B means "A depends on B"
 * This creates a DAG of thought flow.
 */

/**
 * Memory type hierarchy for dependency inference
 * Higher numbers are more "derived" / downstream
 */
const TYPE_HIERARCHY: Record<string, number> = {
  "foundational": 0,  // Core truths - everything depends on these
  "context": 1,       // Background information
  "reference": 1,     // External sources
  "preference": 2,    // User preferences (derived from context)
  "decision": 3,      // Decisions (depend on context + preferences)
  "pattern": 3,       // Patterns (emerge from decisions)
  "learning": 4,      // Learnings (result from decisions/patterns)
  "todo": 4,          // TODOs (follow from decisions)
  "summary": 5,       // Summaries (synthesize everything)
  "contradiction": 5, // Contradictions (detect conflicts)
  "superseded": 6,    // Superseded (historical)
};

/**
 * Infer link type based on temporal and dependency vectors
 */
export function inferLinkType(
  sourceContent: string,
  targetContent: string,
  sourceType?: string,
  targetType?: string,
  sourceTimestamp?: string,
  targetTimestamp?: string
): LinkType {
  const sourceLevel = TYPE_HIERARCHY[sourceType || "context"] ?? 2;
  const targetLevel = TYPE_HIERARCHY[targetType || "context"] ?? 2;

  // TEMPORAL VECTOR: Check timestamps if available
  if (sourceTimestamp && targetTimestamp) {
    const sourceTime = new Date(sourceTimestamp).getTime();
    const targetTime = new Date(targetTimestamp).getTime();
    const timeDiff = sourceTime - targetTime;
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

    // If source is significantly newer and similar content, might supersede
    if (daysDiff > 7 && sourceLevel >= targetLevel) {
      // Check for supersession signals (word-start boundary, allow suffixes)
      if (/\b(supersed\w*|replac\w*|updat\w*|revis\w*|no longer|instead)\b/i.test(sourceContent)) {
        return "supersedes";
      }
    }
  }

  // SPECIAL PATTERNS: Check these before hierarchy-based inference

  // Check for example relationships (content-based, not hierarchy)
  if (/\b(example|instance|case study|such as|e\.g\.|for instance)\b/i.test(sourceContent)) {
    return "example_of";
  }

  // DEPENDENCY VECTOR: Based on type hierarchy

  // Foundational memories: others depend on them
  if (targetType === "foundational") {
    return "depends_on";  // Source depends on foundational target
  }

  // Source is foundational: it supports others
  if (sourceType === "foundational") {
    return "supports";  // Source (foundational) supports target
  }

  // Hierarchy-based inference
  if (sourceLevel > targetLevel) {
    // Source is more derived than target
    // e.g., decision depends on context, learning depends on decision

    if (sourceType === "learning" && targetType === "decision") {
      return "caused_by";  // Learning was caused by decision
    }
    if (sourceType === "todo" && (targetType === "decision" || targetType === "learning")) {
      return "depends_on";  // TODO depends on decision/learning
    }
    if (sourceType === "summary") {
      return "extends";  // Summary extends/synthesizes
    }
    if (sourceType === "pattern" && targetType === "learning") {
      return "extends";  // Pattern extends learnings
    }

    return "depends_on";  // Default: downstream depends on upstream
  }

  if (sourceLevel < targetLevel) {
    // Source is more foundational than target
    // e.g., context supports decision

    if (sourceType === "context" && targetType === "decision") {
      return "supports";  // Context supports decision
    }
    if (sourceType === "reference") {
      return "supports";  // References support
    }
    if (sourceType === "pattern" && targetType === "todo") {
      return "supports";  // Pattern informs TODO
    }

    return "supports";  // Default: upstream supports downstream
  }

  // Same level: check for specific patterns

  // Decision-to-decision: check for supersession
  if (sourceType === "decision" && targetType === "decision") {
    // Two decisions - newer one might supersede
    if (/\b(instead of|rather than|alternative to|replacing)\b/i.test(sourceContent)) {
      return "supersedes";
    }
  }

  // Learning to learning: one extends another
  if (sourceType === "learning" && targetType === "learning") {
    return "extends";
  }

  // Context to context: related
  if (sourceType === "context" && targetType === "context") {
    // Check if one elaborates the other
    if (sourceContent.length > targetContent.length * 1.5) {
      return "extends";  // Longer one extends shorter
    }
  }

  // Pattern to pattern: one implements or extends
  if (sourceType === "pattern" && targetType === "pattern") {
    if (/implement|apply|concrete|specific/i.test(sourceContent)) {
      return "implements";
    }
    return "extends";
  }

  // Check for example relationships
  if (/example|instance|case|such as|e\.g\.|for instance/i.test(sourceContent)) {
    return "example_of";
  }

  // Default: related (no clear direction)
  return "related";
}

/**
 * Calculate link strength based on similarity and type
 */
export function calculateLinkStrength(
  similarity: number,
  linkType: LinkType
): number {
  // Base strength from similarity
  let strength = similarity;

  // Boost for more specific link types
  const typeBoosts: Partial<Record<LinkType, number>> = {
    "supersedes": 0.1,
    "contradicts": 0.15,
    "supports": 0.05,
    "implements": 0.1,
    "depends_on": 0.1,
  };

  strength += typeBoosts[linkType] || 0;

  // Cap at 1.0
  return Math.min(strength, 1.0);
}

// ============ HIGHWAY DETECTION ============

/**
 * Calculate centrality scores for memories
 * Memories with high centrality are "highways" - bridges between clusters
 */
export function calculateCentrality(
  neighbors: Map<string, Array<{ id: string; similarity: number }>>,
  clusters: Map<string, number>
): Map<string, number> {
  const centrality = new Map<string, number>();

  for (const [nodeId, nodeNeighbors] of neighbors) {
    const nodeCluster = clusters.get(nodeId);
    let score = 0;

    // Degree centrality (number of connections)
    score += nodeNeighbors.length * 0.1;

    // Cross-cluster connections (bridge score)
    for (const neighbor of nodeNeighbors) {
      const neighborCluster = clusters.get(neighbor.id);
      if (neighborCluster !== undefined && neighborCluster !== nodeCluster) {
        // Extra points for connecting different clusters
        score += neighbor.similarity * 2;
      } else {
        score += neighbor.similarity * 0.5;
      }
    }

    centrality.set(nodeId, score);
  }

  return centrality;
}

/**
 * Identify highway memories (top N by centrality)
 */
export function identifyHighways(
  centrality: Map<string, number>,
  topN: number = 10
): string[] {
  const sorted = Array.from(centrality.entries())
    .sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, topN).map(([id]) => id);
}

// ============ LINK GENERATION ============

export interface ProposedLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
  strength: number;
  reason: string;
  similarity: number;
  isCrossCluster: boolean;
  isHighwayConnection: boolean;
}

/**
 * Generate proposed links for the memory graph
 */
export function generateProposedLinks(
  memories: Array<Memory & { embedding: number[] }>,
  options: {
    minSimilarity?: number;
    maxLinksPerMemory?: number;
    prioritizeHighways?: boolean;
    prioritizeCrossCluster?: boolean;
  } = {}
): ProposedLink[] {
  const {
    minSimilarity = 0.5,
    maxLinksPerMemory = 5,
    prioritizeHighways = true,
    prioritizeCrossCluster = true,
  } = options;

  // Step 1: Find neighbors
  const neighbors = findKNearestNeighbors(
    memories.map(m => ({ id: m.id, embedding: m.embedding })),
    maxLinksPerMemory * 2, // Get more than we need for filtering
    minSimilarity
  );

  // Step 2: Cluster memories
  const clusters = clusterMemories(neighbors, minSimilarity + 0.1);

  // Step 3: Calculate centrality
  const centrality = calculateCentrality(neighbors, clusters);

  // Step 4: Identify highways
  const highways = new Set(identifyHighways(centrality, Math.ceil(memories.length * 0.1)));

  // Step 5: Generate links
  const proposedLinks: ProposedLink[] = [];
  const memoryMap = new Map(memories.map(m => [m.id, m]));

  for (const [sourceId, sourceNeighbors] of neighbors) {
    const sourceMemory = memoryMap.get(sourceId)!;
    const sourceCluster = clusters.get(sourceId);
    const isSourceHighway = highways.has(sourceId);

    for (const neighbor of sourceNeighbors.slice(0, maxLinksPerMemory)) {
      const targetMemory = memoryMap.get(neighbor.id);
      if (!targetMemory) continue;

      const targetCluster = clusters.get(neighbor.id);
      const isCrossCluster = sourceCluster !== targetCluster;
      const isHighwayConnection = isSourceHighway || highways.has(neighbor.id);

      // Infer link type using temporal and dependency vectors
      const linkType = inferLinkType(
        sourceMemory.content,
        targetMemory.content,
        sourceMemory.type,
        targetMemory.type,
        sourceMemory.timestamp,
        targetMemory.timestamp
      );

      // Calculate strength
      const strength = calculateLinkStrength(neighbor.similarity, linkType);

      // Generate reason
      const reason = generateLinkReason(
        sourceMemory,
        targetMemory,
        linkType,
        isCrossCluster,
        isHighwayConnection
      );

      proposedLinks.push({
        sourceId,
        targetId: neighbor.id,
        type: linkType,
        strength,
        reason,
        similarity: neighbor.similarity,
        isCrossCluster,
        isHighwayConnection,
      });
    }
  }

  // Step 6: Sort by priority
  proposedLinks.sort((a, b) => {
    let scoreA = a.strength;
    let scoreB = b.strength;

    if (prioritizeHighways) {
      if (a.isHighwayConnection) scoreA += 0.2;
      if (b.isHighwayConnection) scoreB += 0.2;
    }

    if (prioritizeCrossCluster) {
      if (a.isCrossCluster) scoreA += 0.15;
      if (b.isCrossCluster) scoreB += 0.15;
    }

    return scoreB - scoreA;
  });

  return proposedLinks;
}

/**
 * Generate human-readable reason for a link
 */
function generateLinkReason(
  source: Memory,
  target: Memory,
  linkType: LinkType,
  isCrossCluster: boolean,
  isHighwayConnection: boolean
): string {
  const parts: string[] = [];

  // Type-based reason
  const typeReasons: Record<LinkType, string> = {
    "related": "Semantically similar content",
    "supports": "Provides supporting evidence or context",
    "contradicts": "Contains potentially conflicting information",
    "extends": "Elaborates or extends the concept",
    "supersedes": "Contains updated or replacement information",
    "depends_on": "Relies on this for context or understanding",
    "caused_by": "Resulted from or was triggered by this",
    "implements": "Provides concrete implementation or application",
    "example_of": "Serves as an example or instance",
  };

  parts.push(typeReasons[linkType]);

  // Topology annotation
  if (isHighwayConnection) {
    parts.push("(highway connection)");
  } else if (isCrossCluster) {
    parts.push("(cross-cluster bridge)");
  }

  // Type annotation
  if (source.type !== target.type) {
    parts.push(`[${source.type} → ${target.type}]`);
  }

  return parts.join(" ");
}

// ============ GRAPH ENRICHMENT RESULT ============

export interface EnrichmentResult {
  totalMemories: number;
  clustersFound: number;
  highwaysIdentified: number;
  linksProposed: number;
  crossClusterLinks: number;
  highwayLinks: number;
  clusters: Map<number, string[]>;  // clusterId -> memoryIds
  highways: string[];
  proposedLinks: ProposedLink[];
}

/**
 * Perform full graph enrichment analysis
 */
export function analyzeGraphEnrichment(
  memories: Array<Memory & { embedding: number[] }>,
  options: {
    minSimilarity?: number;
    maxLinksPerMemory?: number;
  } = {}
): EnrichmentResult {
  const { minSimilarity = 0.5, maxLinksPerMemory = 5 } = options;

  // Get proposed links (this does all the work)
  const proposedLinks = generateProposedLinks(memories, {
    minSimilarity,
    maxLinksPerMemory,
  });

  // Rebuild cluster info for result
  const neighbors = findKNearestNeighbors(
    memories.map(m => ({ id: m.id, embedding: m.embedding })),
    maxLinksPerMemory * 2,
    minSimilarity
  );
  const clusterAssignments = clusterMemories(neighbors, minSimilarity + 0.1);
  const centrality = calculateCentrality(neighbors, clusterAssignments);
  const highways = identifyHighways(centrality, Math.ceil(memories.length * 0.1));

  // Organize clusters
  const clusters = new Map<number, string[]>();
  for (const [memoryId, clusterId] of clusterAssignments) {
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(memoryId);
  }

  return {
    totalMemories: memories.length,
    clustersFound: clusters.size,
    highwaysIdentified: highways.length,
    linksProposed: proposedLinks.length,
    crossClusterLinks: proposedLinks.filter(l => l.isCrossCluster).length,
    highwayLinks: proposedLinks.filter(l => l.isHighwayConnection).length,
    clusters,
    highways,
    proposedLinks,
  };
}

/**
 * Create MemoryLink from ProposedLink
 */
export function proposedLinkToMemoryLink(
  proposed: ProposedLink,
  createdBy: string = "graph-enrichment"
): MemoryLink {
  return {
    targetId: proposed.targetId,
    type: proposed.type,
    reason: proposed.reason,
    strength: proposed.strength,
    createdAt: new Date().toISOString(),
    createdBy,
  };
}
