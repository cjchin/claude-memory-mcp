/**
 * Social Intelligence Module - v3.0 Phase 4
 *
 * Tracks collective knowledge, social proof, and knowledge diffusion.
 * Complements multi-agent collaboration with population-level intelligence.
 */

import type {
  Memory,
  SocialContext,
  Endorsement,
  EndorsementType,
  DiffusionPath,
} from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

export interface SocialIntelligenceConfig {
  // Endorsement settings
  min_endorsements_for_consensus: number;  // Min endorsements to establish consensus
  consensus_threshold: number;              // % agreement for consensus (0-1)
  controversy_threshold: number;            // % disagreement for controversy (0-1)

  // Influence calculation
  influence_damping_factor: number;         // PageRank damping (usually 0.85)
  influence_iterations: number;             // Max PageRank iterations
  influence_convergence: number;            // Convergence threshold

  // Quality metrics
  quality_endorsement_weight: number;       // Weight of endorsements in quality
  quality_trust_weight: number;             // Weight of trust in quality
  quality_diffusion_weight: number;         // Weight of diffusion in quality

  // Trending detection
  trending_window_hours: number;            // Time window for trending
  trending_threshold: number;               // Min activity increase for trending

  // Thought leadership
  thought_leader_min_endorsements: number;  // Min endorsements to be thought leader
  expert_trust_threshold: number;           // Min trust to be domain expert
}

export const DEFAULT_SOCIAL_CONFIG: SocialIntelligenceConfig = {
  min_endorsements_for_consensus: 3,
  consensus_threshold: 0.75,         // 75% agreement
  controversy_threshold: 0.4,        // 40% disagreement
  influence_damping_factor: 0.85,
  influence_iterations: 100,
  influence_convergence: 0.0001,
  quality_endorsement_weight: 0.4,
  quality_trust_weight: 0.3,
  quality_diffusion_weight: 0.3,
  trending_window_hours: 24,
  trending_threshold: 2.0,           // 2x increase
  thought_leader_min_endorsements: 5,
  expert_trust_threshold: 0.8,
};

// ============================================================================
// Endorsement Management
// ============================================================================

/**
 * Add an endorsement to a memory
 */
export function addEndorsement(
  memory: Memory,
  agentId: string,
  type: EndorsementType,
  comment?: string,
  agentTrust?: number
): Memory {
  const now = new Date().toISOString();

  const social = memory.social_context || {};
  const endorsements = social.endorsements || [];

  // Check if agent already endorsed
  const existingIndex = endorsements.findIndex((e) => e.agent_id === agentId);

  const newEndorsement: Endorsement = {
    agent_id: agentId,
    type,
    timestamp: now,
    comment,
    weight: agentTrust || 0.5,
  };

  if (existingIndex >= 0) {
    // Update existing endorsement
    endorsements[existingIndex] = newEndorsement;
  } else {
    // Add new endorsement
    endorsements.push(newEndorsement);
  }

  // Update summary
  const summary = {
    verified: endorsements.filter((e) => e.type === "verified").length,
    useful: endorsements.filter((e) => e.type === "useful").length,
    important: endorsements.filter((e) => e.type === "important").length,
    questioned: endorsements.filter((e) => e.type === "question").length,
    outdated: endorsements.filter((e) => e.type === "outdated").length,
  };

  return {
    ...memory,
    social_context: {
      ...social,
      endorsements,
      endorsement_summary: summary,
      last_social_update: now,
    },
  };
}

/**
 * Remove an endorsement from a memory
 */
export function removeEndorsement(
  memory: Memory,
  agentId: string
): Memory {
  const social = memory.social_context;
  if (!social?.endorsements) return memory;

  const endorsements = social.endorsements.filter((e) => e.agent_id !== agentId);

  // Update summary
  const summary = {
    verified: endorsements.filter((e) => e.type === "verified").length,
    useful: endorsements.filter((e) => e.type === "useful").length,
    important: endorsements.filter((e) => e.type === "important").length,
    questioned: endorsements.filter((e) => e.type === "question").length,
    outdated: endorsements.filter((e) => e.type === "outdated").length,
  };

  return {
    ...memory,
    social_context: {
      ...social,
      endorsements,
      endorsement_summary: summary,
      last_social_update: new Date().toISOString(),
    },
  };
}

/**
 * Get endorsements by type
 */
export function getEndorsementsByType(
  memory: Memory,
  type: EndorsementType
): Endorsement[] {
  return memory.social_context?.endorsements?.filter((e) => e.type === type) || [];
}

/**
 * Get total endorsement count
 */
export function getEndorsementCount(memory: Memory): number {
  return memory.social_context?.endorsements?.length || 0;
}

// ============================================================================
// Knowledge Diffusion Tracking
// ============================================================================

/**
 * Record knowledge diffusion path
 */
export function recordDiffusion(
  memory: Memory,
  fromAgent: string,
  toAgent: string,
  mechanism: "share" | "cite" | "reference" | "validate"
): Memory {
  const social = memory.social_context || {};
  const diffusionPaths = social.diffusion_paths || [];

  const newPath: DiffusionPath = {
    from_agent: fromAgent,
    to_agent: toAgent,
    timestamp: new Date().toISOString(),
    mechanism,
  };

  diffusionPaths.push(newPath);

  // Calculate reach (unique agents)
  const uniqueAgents = new Set<string>();
  if (social.discoverer) uniqueAgents.add(social.discoverer);
  for (const path of diffusionPaths) {
    uniqueAgents.add(path.from_agent);
    uniqueAgents.add(path.to_agent);
  }

  return {
    ...memory,
    social_context: {
      ...social,
      diffusion_paths: diffusionPaths,
      reach: uniqueAgents.size,
      last_social_update: new Date().toISOString(),
    },
  };
}

/**
 * Get diffusion reach (number of unique agents)
 */
export function getDiffusionReach(memory: Memory): number {
  return memory.social_context?.reach || 0;
}

/**
 * Analyze diffusion velocity (spread rate over time)
 */
export function calculateDiffusionVelocity(memory: Memory): number {
  const social = memory.social_context;
  if (!social?.diffusion_paths || social.diffusion_paths.length === 0) {
    return 0;
  }

  const paths = social.diffusion_paths;
  const firstTimestamp = new Date(paths[0].timestamp).getTime();
  const lastTimestamp = new Date(paths[paths.length - 1].timestamp).getTime();

  const hoursDiff = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60);
  if (hoursDiff === 0) return paths.length;

  return paths.length / hoursDiff; // diffusions per hour
}

// ============================================================================
// Consensus Detection
// ============================================================================

/**
 * Calculate consensus level based on endorsements
 */
export function calculateConsensusLevel(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): number {
  const endorsements = memory.social_context?.endorsements || [];
  if (endorsements.length < config.min_endorsements_for_consensus) {
    return 0; // Not enough data
  }

  const positive = endorsements.filter(
    (e) => e.type === "verified" || e.type === "useful" || e.type === "important"
  ).length;

  const total = endorsements.length;
  return positive / total;
}

/**
 * Calculate controversy score (level of disagreement)
 */
export function calculateControversyScore(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): number {
  const endorsements = memory.social_context?.endorsements || [];
  if (endorsements.length < config.min_endorsements_for_consensus) {
    return 0; // Not enough data
  }

  const questioned = endorsements.filter((e) => e.type === "question").length;
  const outdated = endorsements.filter((e) => e.type === "outdated").length;
  const negative = questioned + outdated;

  const total = endorsements.length;
  return negative / total;
}

/**
 * Detect consensus status
 */
export function detectConsensus(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): "strong_consensus" | "weak_consensus" | "controversial" | "insufficient_data" {
  const consensusLevel = calculateConsensusLevel(memory, config);
  const controversyScore = calculateControversyScore(memory, config);

  const endorsements = memory.social_context?.endorsements || [];
  if (endorsements.length < config.min_endorsements_for_consensus) {
    return "insufficient_data";
  }

  if (controversyScore >= config.controversy_threshold) {
    return "controversial";
  }

  if (consensusLevel >= config.consensus_threshold) {
    return "strong_consensus";
  }

  if (consensusLevel >= 0.5) {
    return "weak_consensus";
  }

  return "controversial";
}

// ============================================================================
// Influence Calculation (PageRank-style)
// ============================================================================

/**
 * Calculate influence scores for memories using PageRank algorithm
 *
 * Memories that are cited/referenced more have higher influence.
 */
export function calculateInfluenceScores(
  memories: Memory[],
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): Map<string, number> {
  const scores = new Map<string, number>();
  const outgoingLinks = new Map<string, string[]>();

  // Initialize scores and build citation graph
  for (const memory of memories) {
    scores.set(memory.id, 1.0 / memories.length);

    // Build outgoing links from related_memories
    if (memory.related_memories && memory.related_memories.length > 0) {
      outgoingLinks.set(memory.id, memory.related_memories);
    } else {
      outgoingLinks.set(memory.id, []);
    }
  }

  // PageRank iterations
  for (let i = 0; i < config.influence_iterations; i++) {
    const newScores = new Map<string, number>();
    let maxDelta = 0;

    for (const memory of memories) {
      let sum = 0;

      // Sum contributions from memories that link to this one
      for (const [sourceId, links] of outgoingLinks.entries()) {
        if (links.includes(memory.id)) {
          const sourceScore = scores.get(sourceId) || 0;
          const outDegree = links.length || 1;
          sum += sourceScore / outDegree;
        }
      }

      const dampingFactor = config.influence_damping_factor;
      const newScore =
        (1 - dampingFactor) / memories.length + dampingFactor * sum;

      newScores.set(memory.id, newScore);

      const delta = Math.abs(newScore - (scores.get(memory.id) || 0));
      maxDelta = Math.max(maxDelta, delta);
    }

    scores.clear();
    for (const [id, score] of newScores.entries()) {
      scores.set(id, score);
    }

    // Check convergence
    if (maxDelta < config.influence_convergence) {
      break;
    }
  }

  return scores;
}

// ============================================================================
// Quality Metrics
// ============================================================================

/**
 * Calculate quality score for a memory
 *
 * Combines endorsements, trust levels, and diffusion.
 */
export function calculateQualityScore(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): number {
  const social = memory.social_context;
  if (!social) return 0.5; // Default neutral

  // Endorsement score (0-1)
  const endorsementScore = calculateEndorsementScore(memory);

  // Trust score (0-1)
  const trustScore = calculateAverageTrust(memory);

  // Diffusion score (0-1, normalized by reach)
  const reach = social.reach || 0;
  const diffusionScore = Math.min(1.0, reach / 10); // Cap at 10 agents

  // Weighted combination
  const quality =
    config.quality_endorsement_weight * endorsementScore +
    config.quality_trust_weight * trustScore +
    config.quality_diffusion_weight * diffusionScore;

  return Math.max(0, Math.min(1, quality));
}

/**
 * Calculate endorsement score (positive vs negative)
 */
function calculateEndorsementScore(memory: Memory): number {
  const summary = memory.social_context?.endorsement_summary;
  if (!summary) return 0.5;

  const positive = summary.verified + summary.useful + summary.important;
  const negative = summary.questioned + summary.outdated;
  const total = positive + negative;

  if (total === 0) return 0.5;

  return positive / total;
}

/**
 * Calculate average trust of endorsers
 */
function calculateAverageTrust(memory: Memory): number {
  const endorsements = memory.social_context?.endorsements || [];
  if (endorsements.length === 0) return 0.5;

  const totalTrust = endorsements.reduce((sum, e) => sum + (e.weight || 0.5), 0);
  return totalTrust / endorsements.length;
}

// ============================================================================
// Thought Leadership
// ============================================================================

/**
 * Identify thought leaders for a memory (agents who champion it)
 */
export function identifyThoughtLeaders(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): string[] {
  const endorsements = memory.social_context?.endorsements || [];

  // Count endorsements by agent
  const agentCounts = new Map<string, number>();
  for (const e of endorsements) {
    if (e.type === "verified" || e.type === "important") {
      agentCounts.set(e.agent_id, (agentCounts.get(e.agent_id) || 0) + 1);
    }
  }

  // Filter agents with enough endorsements
  const leaders: string[] = [];
  for (const [agentId, count] of agentCounts.entries()) {
    if (count >= config.thought_leader_min_endorsements) {
      leaders.push(agentId);
    }
  }

  return leaders;
}

/**
 * Identify domain experts (high-trust agents who validated)
 */
export function identifyDomainExperts(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): string[] {
  const endorsements = memory.social_context?.endorsements || [];

  return endorsements
    .filter(
      (e) =>
        e.type === "verified" &&
        (e.weight || 0) >= config.expert_trust_threshold
    )
    .map((e) => e.agent_id);
}

// ============================================================================
// Trending Detection
// ============================================================================

/**
 * Calculate trending score (recent attention increase)
 */
export function calculateTrendingScore(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): number {
  const social = memory.social_context;
  if (!social?.endorsements || social.endorsements.length === 0) {
    return 0;
  }

  const now = new Date().getTime();
  const windowMs = config.trending_window_hours * 60 * 60 * 1000;

  // Count endorsements in recent window
  const recentCount = social.endorsements.filter((e) => {
    const timestamp = new Date(e.timestamp).getTime();
    return now - timestamp <= windowMs;
  }).length;

  // Count endorsements before window
  const olderCount = social.endorsements.filter((e) => {
    const timestamp = new Date(e.timestamp).getTime();
    return now - timestamp > windowMs;
  }).length;

  if (olderCount === 0) {
    // All endorsements are recent
    return recentCount > 0 ? 1.0 : 0;
  }

  // Calculate ratio of recent to older
  const ratio = recentCount / olderCount;

  // Normalize to 0-1
  return Math.min(1.0, ratio / config.trending_threshold);
}

/**
 * Detect if memory is trending
 */
export function isTrending(
  memory: Memory,
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): boolean {
  const score = calculateTrendingScore(memory, config);
  return score >= 0.5;
}

// ============================================================================
// Collective Intelligence Aggregation
// ============================================================================

/**
 * Update all social metrics for a memory
 */
export function updateSocialMetrics(
  memory: Memory,
  allMemories: Memory[],
  config: SocialIntelligenceConfig = DEFAULT_SOCIAL_CONFIG
): Memory {
  const social = memory.social_context || {};

  // Calculate all metrics
  const consensusLevel = calculateConsensusLevel(memory, config);
  const controversyScore = calculateControversyScore(memory, config);
  const qualityScore = calculateQualityScore(memory, config);
  const trendingScore = calculateTrendingScore(memory, config);
  const averageTrust = calculateAverageTrust(memory);
  const thoughtLeaders = identifyThoughtLeaders(memory, config);
  const domainExperts = identifyDomainExperts(memory, config);

  // Calculate influence scores for all memories
  const influenceScores = calculateInfluenceScores(allMemories, config);
  const influenceScore = influenceScores.get(memory.id) || 0;

  // Calculate stability (low variance in endorsements over time)
  const stabilityScore = calculateStabilityScore(memory);

  return {
    ...memory,
    social_context: {
      ...social,
      consensus_level: consensusLevel,
      controversy_score: controversyScore,
      quality_score: qualityScore,
      trending_score: trendingScore,
      average_trust: averageTrust,
      thought_leaders: thoughtLeaders,
      domain_experts: domainExperts,
      influence_score: influenceScore,
      stability_score: stabilityScore,
      collective_confidence: qualityScore, // Use quality as confidence
      last_social_update: new Date().toISOString(),
      computed_by: "social_intelligence_module",
    },
  };
}

/**
 * Calculate stability score (how consistent endorsements are over time)
 */
function calculateStabilityScore(memory: Memory): number {
  const endorsements = memory.social_context?.endorsements || [];
  if (endorsements.length < 3) return 0.5; // Not enough data

  // Sort by timestamp
  const sorted = [...endorsements].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Calculate variance in endorsement types over time
  const windows = 3;
  const windowSize = Math.floor(sorted.length / windows);

  if (windowSize === 0) return 0.5;

  const windowScores: number[] = [];
  for (let i = 0; i < windows; i++) {
    const start = i * windowSize;
    const end = i === windows - 1 ? sorted.length : (i + 1) * windowSize;
    const windowEndorsements = sorted.slice(start, end);

    const positive = windowEndorsements.filter(
      (e) => e.type === "verified" || e.type === "useful" || e.type === "important"
    ).length;

    windowScores.push(positive / windowEndorsements.length);
  }

  // Calculate variance
  const mean = windowScores.reduce((sum, s) => sum + s, 0) / windowScores.length;
  const variance =
    windowScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) /
    windowScores.length;

  // Lower variance = higher stability
  return Math.max(0, 1 - variance);
}

/**
 * Get collective intelligence summary for a set of memories
 */
export function getCollectiveIntelligenceSummary(memories: Memory[]): {
  total_memories: number;
  total_endorsements: number;
  average_quality: number;
  high_consensus_count: number;
  controversial_count: number;
  trending_count: number;
  top_influencers: Array<{ memory_id: string; influence: number }>;
  thought_leaders: Map<string, number>; // agent_id -> endorsement count
} {
  let totalEndorsements = 0;
  let qualitySum = 0;
  let highConsensusCount = 0;
  let controversialCount = 0;
  let trendingCount = 0;

  const thoughtLeaderCounts = new Map<string, number>();

  for (const memory of memories) {
    const social = memory.social_context;
    if (!social) continue;

    totalEndorsements += social.endorsements?.length || 0;
    qualitySum += social.quality_score || 0;

    if ((social.consensus_level || 0) >= 0.75) highConsensusCount++;
    if ((social.controversy_score || 0) >= 0.4) controversialCount++;
    if ((social.trending_score || 0) >= 0.5) trendingCount++;

    for (const leader of social.thought_leaders || []) {
      thoughtLeaderCounts.set(leader, (thoughtLeaderCounts.get(leader) || 0) + 1);
    }
  }

  // Calculate influence scores and get top 10
  const influenceScores = calculateInfluenceScores(memories);
  const topInfluencers = Array.from(influenceScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([memory_id, influence]) => ({ memory_id, influence }));

  return {
    total_memories: memories.length,
    total_endorsements: totalEndorsements,
    average_quality: memories.length > 0 ? qualitySum / memories.length : 0,
    high_consensus_count: highConsensusCount,
    controversial_count: controversialCount,
    trending_count: trendingCount,
    top_influencers: topInfluencers,
    thought_leaders: thoughtLeaderCounts,
  };
}
