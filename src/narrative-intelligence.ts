/**
 * Narrative Intelligence Module - v3.0 Phase 2
 *
 * Detects story arcs, causal chains, and narrative structure across memories.
 * Based on Freytag's Pyramid (dramatic structure) and narrative identity theory.
 *
 * Key concepts:
 * - Story arcs: Sequences of memories forming coherent narratives
 * - Narrative roles: Where each memory fits in dramatic structure
 * - Causal chains: cause → effect relationships between memories
 * - Turning points: Critical decisions and realizations
 * - Themes: Recurring topics across related memories
 *
 * Architecture:
 * 1. Temporal-semantic clustering: Group related memories by time and topic
 * 2. Causal graph construction: Detect problem → solution chains
 * 3. Narrative role classification: Identify exposition, climax, resolution
 * 4. Emotional arc extraction: Tension → release patterns
 * 5. Theme extraction: Common topics across story arcs
 */

import type { Memory, NarrativeContext, NarrativeRole } from "./types.js";

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Keywords indicating different narrative roles
 */
const NARRATIVE_ROLE_SIGNALS = {
  exposition: [
    "context", "background", "setup", "started", "began", "initially",
    "requirements", "goal", "wanted to", "needed to", "planning"
  ],
  rising_action: [
    "then", "next", "tried", "attempted", "working on", "investigating",
    "found that", "discovered", "realized", "challenge", "problem",
    "complication", "issue", "bug", "error"
  ],
  climax: [
    "critical", "breakthrough", "key insight", "aha", "finally",
    "decided", "chose", "major", "pivotal", "crucial", "turned out",
    "root cause", "core issue"
  ],
  falling_action: [
    "therefore", "so", "as a result", "consequence", "led to",
    "after", "following", "implemented", "applied", "fixed"
  ],
  resolution: [
    "resolved", "solved", "completed", "finished", "deployed",
    "working now", "lesson learned", "in the end", "finally working",
    "conclusion", "outcome", "result"
  ]
} as const;

/**
 * Causal signal words (cause → effect indicators)
 */
const CAUSAL_SIGNALS = {
  cause: ["because", "since", "due to", "caused by", "resulted from", "triggered by"],
  effect: ["therefore", "so", "thus", "consequently", "as a result", "led to", "caused"]
} as const;

/**
 * Turning point indicators (critical moments)
 */
const TURNING_POINT_SIGNALS = [
  "decided", "chose", "realized", "breakthrough", "aha",
  "key insight", "root cause", "turning point", "game changer",
  "critical", "pivotal", "crucial decision"
] as const;

/**
 * Configuration for narrative detection
 */
export interface NarrativeDetectionConfig {
  temporal_window_hours: number;       // Max time gap for same story arc (default: 48)
  min_arc_length: number;              // Min memories to form arc (default: 3)
  theme_min_frequency: number;         // Min tag frequency for theme (default: 2)
  causal_confidence_threshold: number; // Min confidence for causal links (default: 0.6)
}

export const DEFAULT_NARRATIVE_CONFIG: NarrativeDetectionConfig = {
  temporal_window_hours: 48,
  min_arc_length: 3,
  theme_min_frequency: 2,
  causal_confidence_threshold: 0.6
};

// ============================================================================
// Core Narrative Detection Functions
// ============================================================================

/**
 * Infer narrative role from memory content
 *
 * Uses keyword matching and memory type heuristics to classify
 * memories into Freytag's Pyramid stages.
 *
 * @param memory - Memory to analyze
 * @param explicitRole - Override with explicit role if provided
 * @returns NarrativeContext with inferred role
 */
export function inferNarrativeRole(
  memory: Memory,
  explicitRole?: NarrativeRole
): NarrativeContext {
  if (explicitRole) {
    return {
      narrative_role: explicitRole,
      detected_by: "explicit",
      narrative_confidence: 1.0
    };
  }

  const content = memory.content.toLowerCase();
  const roleScores: Record<NarrativeRole, number> = {
    exposition: 0,
    rising_action: 0,
    climax: 0,
    falling_action: 0,
    resolution: 0
  };

  // Score based on keyword presence
  for (const [role, signals] of Object.entries(NARRATIVE_ROLE_SIGNALS)) {
    for (const signal of signals) {
      if (content.includes(signal.toLowerCase())) {
        roleScores[role as NarrativeRole] += 1;
      }
    }
  }

  // Type-based heuristics
  if (memory.type === "context") {
    roleScores.exposition += 2;
  } else if (memory.type === "learning" || memory.type === "pattern") {
    roleScores.resolution += 2;
  } else if (memory.type === "decision") {
    roleScores.climax += 3;
  } else if (memory.type === "todo") {
    roleScores.rising_action += 1;
  }

  // Emotional arc heuristics (if available)
  if (memory.emotional_context) {
    const ec = memory.emotional_context;

    // High arousal + negative valence → rising_action (tension building)
    if (ec.arousal > 0.6 && ec.valence < -0.3) {
      roleScores.rising_action += 2;
    }

    // High arousal + positive valence → climax (breakthrough)
    if (ec.arousal > 0.7 && ec.valence > 0.4) {
      roleScores.climax += 2;
    }

    // Low arousal + positive valence → resolution (calm satisfaction)
    if (ec.arousal < 0.4 && ec.valence > 0.3) {
      roleScores.resolution += 2;
    }
  }

  // Find highest scoring role
  let maxScore = 0;
  let bestRole: NarrativeRole = "exposition"; // default
  for (const [role, score] of Object.entries(roleScores)) {
    if (score > maxScore) {
      maxScore = score;
      bestRole = role as NarrativeRole;
    }
  }

  // Calculate confidence based on score strength
  const totalScore = Object.values(roleScores).reduce((sum, score) => sum + score, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.3;

  // Check for turning point indicators
  const isTurningPoint = TURNING_POINT_SIGNALS.some(signal =>
    content.includes(signal.toLowerCase())
  );

  return {
    narrative_role: bestRole,
    turning_point: isTurningPoint || undefined,
    narrative_confidence: Math.min(confidence, 1.0),
    detected_by: "inferred"
  };
}

/**
 * Detect causal relationships between two memories
 *
 * Analyzes content for cause-effect language and temporal ordering
 * to determine if one memory caused another.
 *
 * @param cause - Potential cause memory
 * @param effect - Potential effect memory
 * @returns Confidence score (0-1) that cause led to effect
 */
export function detectCausalRelationship(
  cause: Memory,
  effect: Memory
): number {
  let confidence = 0;

  // Temporal ordering (cause must precede effect)
  const causeTime = new Date(cause.timestamp).getTime();
  const effectTime = new Date(effect.timestamp).getTime();

  if (causeTime >= effectTime) {
    return 0; // No causality if effect precedes cause
  }

  const timeDiffHours = (effectTime - causeTime) / (1000 * 60 * 60);

  // Temporal proximity (closer in time = more likely causal)
  if (timeDiffHours < 1) confidence += 0.3;
  else if (timeDiffHours < 24) confidence += 0.2;
  else if (timeDiffHours < 48) confidence += 0.1;

  // Content analysis
  const effectContent = effect.content.toLowerCase();

  // Check for explicit causal language referencing the cause
  const causeWords = cause.content.toLowerCase().split(/\s+/).slice(0, 5);
  const hasCauseReference = causeWords.some(word =>
    word.length > 4 && effectContent.includes(word)
  );

  if (hasCauseReference) {
    confidence += 0.2;
  }

  // Check for causal signal words
  const hasCauseSignal = CAUSAL_SIGNALS.cause.some(signal =>
    effectContent.includes(signal.toLowerCase())
  );
  const hasEffectSignal = CAUSAL_SIGNALS.effect.some(signal =>
    effectContent.includes(signal.toLowerCase())
  );

  if (hasCauseSignal || hasEffectSignal) {
    confidence += 0.2;
  }

  // Tag overlap (shared context increases causal likelihood)
  const sharedTags = cause.tags.filter(tag => effect.tags.includes(tag));
  if (sharedTags.length > 0) {
    confidence += Math.min(sharedTags.length * 0.1, 0.3);
  }

  // Type-based heuristics
  if (cause.type === "decision" && effect.type === "learning") {
    confidence += 0.2; // Decisions often lead to learnings
  }
  if (cause.type === "todo" && effect.type === "decision") {
    confidence += 0.15; // TODOs often lead to decisions
  }

  return Math.min(confidence, 1.0);
}

/**
 * Build causal chain from a starting memory
 *
 * Traverses forward in time to find memories that were caused by
 * the starting memory, forming a causal chain.
 *
 * @param startMemory - Memory to start from
 * @param allMemories - Pool of memories to search
 * @param config - Detection configuration
 * @returns Array of memories in causal sequence
 */
export function buildCausalChain(
  startMemory: Memory,
  allMemories: Memory[],
  config: NarrativeDetectionConfig = DEFAULT_NARRATIVE_CONFIG
): Array<{ memory: Memory; causalConfidence: number }> {
  const chain: Array<{ memory: Memory; causalConfidence: number }> = [
    { memory: startMemory, causalConfidence: 1.0 }
  ];

  let currentMemory = startMemory;
  const visited = new Set<string>([startMemory.id]);

  // Follow causal links forward in time
  while (true) {
    // Find potential next memories (after current, within temporal window)
    const currentTime = new Date(currentMemory.timestamp).getTime();
    const candidates = allMemories.filter(m => {
      if (visited.has(m.id)) return false;
      const mTime = new Date(m.timestamp).getTime();
      const hoursDiff = (mTime - currentTime) / (1000 * 60 * 60);
      return hoursDiff > 0 && hoursDiff < config.temporal_window_hours;
    });

    if (candidates.length === 0) break;

    // Score causal relationships
    const scored = candidates.map(candidate => ({
      memory: candidate,
      causalConfidence: detectCausalRelationship(currentMemory, candidate)
    }));

    // Find best candidate
    const best = scored.reduce((max, curr) =>
      curr.causalConfidence > max.causalConfidence ? curr : max
    );

    // If confidence too low, stop
    if (best.causalConfidence < config.causal_confidence_threshold) {
      break;
    }

    // Add to chain and continue
    chain.push(best);
    visited.add(best.memory.id);
    currentMemory = best.memory;
  }

  return chain;
}

/**
 * Detect story arcs across memories
 *
 * Groups memories into coherent narrative arcs using temporal-semantic
 * clustering and causal chain detection.
 *
 * @param memories - All memories to analyze
 * @param config - Detection configuration
 * @returns Array of story arcs (each arc is an array of memories)
 */
export function detectStoryArcs(
  memories: Memory[],
  config: NarrativeDetectionConfig = DEFAULT_NARRATIVE_CONFIG
): Array<{
  arc_id: string;
  memories: Memory[];
  theme: string;
  startTime: string;
  endTime: string;
}> {
  const arcs: Array<{
    arc_id: string;
    memories: Memory[];
    theme: string;
    startTime: string;
    endTime: string;
  }> = [];

  const unassigned = new Set(memories.map(m => m.id));

  // Sort by timestamp
  const sorted = [...memories].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Build arcs from each unassigned memory
  for (const start of sorted) {
    if (!unassigned.has(start.id)) continue;

    const chain = buildCausalChain(start, sorted, config);

    // Only create arc if long enough
    if (chain.length < config.min_arc_length) {
      continue;
    }

    // Extract theme from tags
    const allTags = chain.flatMap(c => c.memory.tags);
    const tagFreq: Record<string, number> = {};
    for (const tag of allTags) {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    }

    const theme = Object.entries(tagFreq)
      .filter(([_, count]) => count >= config.theme_min_frequency)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, _]) => tag)[0] || "general";

    // Create arc
    const arcMemories = chain.map(c => c.memory);
    arcs.push({
      arc_id: `arc_${start.id}_${arcMemories.length}`,
      memories: arcMemories,
      theme,
      startTime: arcMemories[0].timestamp,
      endTime: arcMemories[arcMemories.length - 1].timestamp
    });

    // Mark as assigned
    for (const { memory } of chain) {
      unassigned.delete(memory.id);
    }
  }

  return arcs;
}

/**
 * Extract themes from a collection of memories
 *
 * Analyzes tags and content to identify recurring themes.
 *
 * @param memories - Memories to analyze
 * @param minFrequency - Minimum occurrence count for theme (default: 2)
 * @returns Array of themes sorted by frequency
 */
export function extractThemes(
  memories: Memory[],
  minFrequency: number = 2
): Array<{ theme: string; count: number; memories: string[] }> {
  const tagFreq: Record<string, string[]> = {};

  for (const memory of memories) {
    for (const tag of memory.tags) {
      if (!tagFreq[tag]) {
        tagFreq[tag] = [];
      }
      tagFreq[tag].push(memory.id);
    }
  }

  return Object.entries(tagFreq)
    .filter(([_, ids]) => ids.length >= minFrequency)
    .map(([theme, ids]) => ({
      theme,
      count: ids.length,
      memories: ids
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Find resolution for a problem/question memory
 *
 * Searches forward in time for memories that resolve the given problem.
 *
 * @param problemMemory - Memory containing problem or question
 * @param allMemories - Pool of memories to search
 * @param maxDaysForward - How far forward to search (default: 30)
 * @returns Memory that resolves the problem, or null
 */
export function findResolution(
  problemMemory: Memory,
  allMemories: Memory[],
  maxDaysForward: number = 30
): { memory: Memory; confidence: number } | null {
  const problemTime = new Date(problemMemory.timestamp).getTime();
  const maxTime = problemTime + (maxDaysForward * 24 * 60 * 60 * 1000);

  // Find candidate resolutions (after problem, within time window)
  const candidates = allMemories.filter(m => {
    const mTime = new Date(m.timestamp).getTime();
    return mTime > problemTime && mTime < maxTime;
  });

  if (candidates.length === 0) return null;

  // Score candidates
  const scored = candidates.map(candidate => {
    let confidence = 0;

    // Type heuristics
    if (candidate.type === "learning" || candidate.type === "pattern") {
      confidence += 0.3;
    }
    if (candidate.type === "decision") {
      confidence += 0.2;
    }

    // Tag overlap
    const sharedTags = problemMemory.tags.filter(tag =>
      candidate.tags.includes(tag)
    );
    confidence += Math.min(sharedTags.length * 0.15, 0.4);

    // Resolution keywords
    const content = candidate.content.toLowerCase();
    const hasResolutionWord = ["solved", "resolved", "fixed", "working now", "solution"]
      .some(word => content.includes(word));

    if (hasResolutionWord) {
      confidence += 0.3;
    }

    // Emotional shift (problem → relief)
    if (problemMemory.emotional_context && candidate.emotional_context) {
      const problemValence = problemMemory.emotional_context.valence;
      const resolutionValence = candidate.emotional_context.valence;

      if (problemValence < -0.3 && resolutionValence > 0.3) {
        confidence += 0.2; // Shift from negative to positive
      }
    }

    return { memory: candidate, confidence };
  });

  // Return best match
  const best = scored.reduce((max, curr) =>
    curr.confidence > max.confidence ? curr : max
  );

  return best.confidence > 0.5 ? best : null;
}

/**
 * Analyze narrative structure of a memory collection
 *
 * Provides high-level statistics about narrative patterns.
 *
 * @param memories - Memories to analyze
 * @returns Narrative analysis report
 */
export function analyzeNarrativeStructure(memories: Memory[]): {
  total_memories: number;
  with_narrative_context: number;
  role_distribution: Record<NarrativeRole, number>;
  turning_points: number;
  story_arcs: number;
  themes: Array<{ theme: string; count: number }>;
  avg_arc_length: number;
} {
  const withContext = memories.filter(m => m.narrative_context !== undefined);

  const roleDistribution: Record<NarrativeRole, number> = {
    exposition: 0,
    rising_action: 0,
    climax: 0,
    falling_action: 0,
    resolution: 0
  };

  let turningPoints = 0;

  for (const memory of withContext) {
    const nc = memory.narrative_context!;
    if (nc.narrative_role) {
      roleDistribution[nc.narrative_role]++;
    }
    if (nc.turning_point) {
      turningPoints++;
    }
  }

  const arcs = detectStoryArcs(memories);
  const themes = extractThemes(memories);
  const avgArcLength = arcs.length > 0
    ? arcs.reduce((sum, arc) => sum + arc.memories.length, 0) / arcs.length
    : 0;

  return {
    total_memories: memories.length,
    with_narrative_context: withContext.length,
    role_distribution: roleDistribution,
    turning_points: turningPoints,
    story_arcs: arcs.length,
    themes: themes.slice(0, 10),
    avg_arc_length: Math.round(avgArcLength * 10) / 10
  };
}
