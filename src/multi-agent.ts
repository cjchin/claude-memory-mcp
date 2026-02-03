/**
 * Multi-Agent Intelligence Module - v3.0 Phase 3
 *
 * Enables shared minds through multi-agent collaboration.
 * Provides agent registration, conflict detection, consensus building, and access control.
 *
 * Key concepts:
 * - Agent identity: Each agent has unique ID, type, and capabilities
 * - Shared soul: Multiple agents can access and contribute to the same memory system
 * - Conflict detection: Identify when agents disagree
 * - Consensus building: Resolve disagreements through voting, synthesis, or expertise
 * - Access control: Memory-level permissions for privacy
 *
 * Architecture:
 * 1. Agent registration and management
 * 2. Conflict detection (detecting disagreements)
 * 3. Consensus algorithms (voting, trust-weighted, synthesis)
 * 4. Access control (ACLs, visibility levels)
 * 5. Collaboration tracking (who contributed what)
 */

import type {
  Memory,
  AgentIdentity,
  AgentType,
  MemoryACL,
  ConsensusStatus,
  MultiAgentContext
} from "./types.js";

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Configuration for multi-agent behavior
 */
export interface MultiAgentConfig {
  default_trust_level: number;        // Default trust for new agents (0-1)
  consensus_threshold: number;        // % of agents needed for consensus
  dispute_threshold: number;          // % needed to mark as disputed
  auto_resolve: boolean;              // Automatically resolve simple conflicts
  max_agents_per_memory: number;      // Limit contributors per memory
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
  default_trust_level: 0.5,
  consensus_threshold: 0.66,          // 2/3 majority
  dispute_threshold: 0.33,            // 1/3 can dispute
  auto_resolve: false,                // Require explicit resolution
  max_agents_per_memory: 10
};

// ============================================================================
// Agent Registry
// ============================================================================

/**
 * In-memory agent registry
 * In production, this would be persisted to database
 */
const agentRegistry = new Map<string, AgentIdentity>();

/**
 * Register a new agent in the system
 *
 * @param agent - Agent identity to register
 * @returns Registered agent with timestamp
 */
export function registerAgent(agent: AgentIdentity): AgentIdentity {
  const now = new Date().toISOString();

  const registered: AgentIdentity = {
    ...agent,
    created_at: agent.created_at || now,
    last_active: now,
    trust_level: agent.trust_level ?? DEFAULT_MULTI_AGENT_CONFIG.default_trust_level
  };

  agentRegistry.set(agent.agent_id, registered);
  return registered;
}

/**
 * Get agent by ID
 */
export function getAgent(agentId: string): AgentIdentity | undefined {
  return agentRegistry.get(agentId);
}

/**
 * Update agent's last active timestamp
 */
export function updateAgentActivity(agentId: string): void {
  const agent = agentRegistry.get(agentId);
  if (agent) {
    agent.last_active = new Date().toISOString();
  }
}

/**
 * List all registered agents
 */
export function listAgents(): AgentIdentity[] {
  return Array.from(agentRegistry.values());
}

/**
 * Update agent trust level
 */
export function setAgentTrust(agentId: string, trustLevel: number): void {
  const agent = agentRegistry.get(agentId);
  if (agent) {
    agent.trust_level = Math.max(0, Math.min(1, trustLevel));
  }
}

// ============================================================================
// Access Control
// ============================================================================

/**
 * Check if agent has read access to memory
 */
export function canRead(memory: Memory, agentId: string): boolean {
  const mac = memory.multi_agent_context;
  if (!mac?.acl) return true; // No ACL = public read

  const acl = mac.acl;

  // Owner always has access
  if (acl.owner === agentId) return true;

  // Check visibility
  if (acl.visibility === "public") return true;

  // Check explicit read access
  return acl.read_access.includes(agentId);
}

/**
 * Check if agent has write access to memory
 */
export function canWrite(memory: Memory, agentId: string): boolean {
  const mac = memory.multi_agent_context;
  if (!mac?.acl) return true; // No ACL = public write

  const acl = mac.acl;

  // Owner always has access
  if (acl.owner === agentId) return true;

  // Check explicit write access
  return acl.write_access.includes(agentId);
}

/**
 * Create default ACL for a memory
 */
export function createDefaultACL(
  ownerAgentId: string,
  visibility: "private" | "team" | "public" = "team"
): MemoryACL {
  return {
    owner: ownerAgentId,
    read_access: visibility === "private" ? [ownerAgentId] : [],
    write_access: [ownerAgentId],
    visibility
  };
}

/**
 * Grant read access to agent
 */
export function grantReadAccess(acl: MemoryACL, agentId: string): void {
  if (!acl.read_access.includes(agentId)) {
    acl.read_access.push(agentId);
  }
}

/**
 * Grant write access to agent
 */
export function grantWriteAccess(acl: MemoryACL, agentId: string): void {
  if (!acl.write_access.includes(agentId)) {
    acl.write_access.push(agentId);
  }
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect if two memories conflict
 *
 * Conflicts occur when:
 * 1. Same topic but contradictory content
 * 2. Superseding relationship with disagreement
 * 3. Temporal inconsistency (both claim to be true at same time)
 */
export function detectConflict(memoryA: Memory, memoryB: Memory): {
  hasConflict: boolean;
  conflictType?: "content" | "temporal" | "supersedes";
  reason?: string;
  confidence: number;
} {
  let hasConflict = false;
  let conflictType: "content" | "temporal" | "supersedes" | undefined;
  let reason: string | undefined;
  let confidence = 0;

  // Check for superseding relationship
  if (memoryA.supersedes === memoryB.id || memoryB.supersedes === memoryA.id) {
    const newer = memoryA.supersedes === memoryB.id ? memoryA : memoryB;
    const older = newer === memoryA ? memoryB : memoryA;

    // Check if different agents created them
    const newerAgent = newer.multi_agent_context?.created_by?.agent_id;
    const olderAgent = older.multi_agent_context?.created_by?.agent_id;

    if (newerAgent && olderAgent && newerAgent !== olderAgent) {
      hasConflict = true;
      conflictType = "supersedes";
      reason = `Agent ${newerAgent} superseded memory by agent ${olderAgent}`;
      confidence = 0.8;
    }
  }

  // Check for temporal overlap (both claim to be valid at same time)
  if (memoryA.valid_from && memoryB.valid_from && !memoryA.valid_until && !memoryB.valid_until) {
    // Both currently valid
    const sharedTags = memoryA.tags.filter(tag => memoryB.tags.includes(tag));
    if (sharedTags.length >= 2) {
      // Similar topics, check for contradiction keywords
      const contentA = memoryA.content.toLowerCase();
      const contentB = memoryB.content.toLowerCase();

      const contradictionPairs = [
        ["never", "always"],
        ["not", "is"],
        ["false", "true"],
        ["incorrect", "correct"],
        ["bug", "feature"]
      ];

      for (const [wordA, wordB] of contradictionPairs) {
        if (
          (contentA.includes(wordA) && contentB.includes(wordB)) ||
          (contentA.includes(wordB) && contentB.includes(wordA))
        ) {
          hasConflict = true;
          conflictType = "content";
          reason = `Potential contradiction: "${wordA}" vs "${wordB}"`;
          confidence = Math.min(confidence + 0.3, 0.9);
        }
      }
    }
  }

  return { hasConflict, conflictType, reason, confidence };
}

/**
 * Find all conflicts for a memory
 */
export function findConflicts(
  memory: Memory,
  allMemories: Memory[],
  minConfidence: number = 0.6
): Array<{ memory: Memory; conflict: ReturnType<typeof detectConflict> }> {
  const conflicts: Array<{ memory: Memory; conflict: ReturnType<typeof detectConflict> }> = [];

  for (const other of allMemories) {
    if (other.id === memory.id) continue;

    const conflict = detectConflict(memory, other);
    if (conflict.hasConflict && conflict.confidence >= minConfidence) {
      conflicts.push({ memory: other, conflict });
    }
  }

  return conflicts;
}

// ============================================================================
// Consensus Building
// ============================================================================

/**
 * Calculate consensus status for a memory
 */
export function calculateConsensus(
  memory: Memory,
  config: MultiAgentConfig = DEFAULT_MULTI_AGENT_CONFIG
): ConsensusStatus {
  const mac = memory.multi_agent_context;
  if (!mac) return "pending";

  const agreedCount = mac.agreed_by?.length || 0;
  const disputedCount = mac.disputed_by?.length || 0;
  const totalCount = agreedCount + disputedCount;

  if (totalCount === 0) return "pending";

  const agreeRatio = agreedCount / totalCount;

  if (agreeRatio >= config.consensus_threshold) {
    return "agreed";
  } else if ((disputedCount / totalCount) >= config.dispute_threshold) {
    return "disputed";
  }

  return "pending";
}

/**
 * Vote on a memory (agree or dispute)
 */
export function voteOnMemory(
  memory: Memory,
  agentId: string,
  vote: "agree" | "dispute",
  reason?: string
): MultiAgentContext {
  if (!memory.multi_agent_context) {
    memory.multi_agent_context = {
      agreed_by: [],
      disputed_by: []
    };
  }

  const mac = memory.multi_agent_context;

  // Remove from opposite list if present
  if (vote === "agree") {
    mac.agreed_by = mac.agreed_by || [];
    if (!mac.agreed_by.includes(agentId)) {
      mac.agreed_by.push(agentId);
    }
    mac.disputed_by = mac.disputed_by?.filter(id => id !== agentId) || [];
  } else {
    mac.disputed_by = mac.disputed_by || [];
    if (!mac.disputed_by.includes(agentId)) {
      mac.disputed_by.push(agentId);
    }
    mac.agreed_by = mac.agreed_by?.filter(id => id !== agentId) || [];

    if (reason) {
      mac.dispute_reason = reason;
    }
  }

  // Recalculate consensus status
  mac.consensus_status = calculateConsensus(memory);

  return mac;
}

/**
 * Resolve conflict using trust-weighted voting
 */
export function resolveByVoting(
  memory: Memory,
  config: MultiAgentConfig = DEFAULT_MULTI_AGENT_CONFIG
): {
  resolution: "accepted" | "rejected" | "tie";
  confidence: number;
} {
  const mac = memory.multi_agent_context;
  if (!mac?.agreed_by && !mac?.disputed_by) {
    return { resolution: "tie", confidence: 0 };
  }

  const agreedBy = mac.agreed_by || [];
  const disputedBy = mac.disputed_by || [];

  // Calculate trust-weighted scores
  let agreeScore = 0;
  let disputeScore = 0;

  for (const agentId of agreedBy) {
    const agent = getAgent(agentId);
    agreeScore += agent?.trust_level || config.default_trust_level;
  }

  for (const agentId of disputedBy) {
    const agent = getAgent(agentId);
    disputeScore += agent?.trust_level || config.default_trust_level;
  }

  const totalScore = agreeScore + disputeScore;
  if (totalScore === 0) return { resolution: "tie", confidence: 0 };

  const agreeRatio = agreeScore / totalScore;

  if (agreeRatio > 0.5) {
    return { resolution: "accepted", confidence: agreeRatio };
  } else if (agreeRatio < 0.5) {
    return { resolution: "rejected", confidence: 1 - agreeRatio };
  }

  return { resolution: "tie", confidence: 0.5 };
}

/**
 * Mark conflict as resolved
 */
export function markResolved(
  memory: Memory,
  method: "vote" | "synthesize" | "defer_expert" | "accept_both",
  resolverAgentId: string
): void {
  if (!memory.multi_agent_context) {
    memory.multi_agent_context = {};
  }

  memory.multi_agent_context.consensus_status = "resolved";
  memory.multi_agent_context.resolution_method = method;
  memory.multi_agent_context.resolution_timestamp = new Date().toISOString();
  memory.multi_agent_context.resolver_agent = resolverAgentId;
}

// ============================================================================
// Collaboration Tracking
// ============================================================================

/**
 * Add contributor to memory
 */
export function addContributor(
  memory: Memory,
  agent: AgentIdentity,
  reason?: string
): void {
  if (!memory.multi_agent_context) {
    memory.multi_agent_context = {
      created_by: agent,
      contributors: []
    };
  }

  const mac = memory.multi_agent_context;

  if (!mac.contributors) {
    mac.contributors = [];
  }

  // Check if already a contributor
  const exists = mac.contributors.some(c => c.agent_id === agent.agent_id);
  if (!exists) {
    mac.contributors.push(agent);
  }

  // Track last modifier
  mac.last_modified_by = agent.agent_id;
}

/**
 * Share memory with agent
 */
export function shareMemoryWith(
  memory: Memory,
  agentId: string,
  reason?: string
): void {
  if (!memory.multi_agent_context) {
    memory.multi_agent_context = {};
  }

  const mac = memory.multi_agent_context;

  if (!mac.shared_with) {
    mac.shared_with = [];
  }

  // Check if already shared
  const exists = mac.shared_with.some(s => s.agent_id === agentId);
  if (!exists) {
    mac.shared_with.push({
      agent_id: agentId,
      shared_at: new Date().toISOString(),
      reason
    });
  }

  // Grant read access if ACL exists
  if (mac.acl) {
    grantReadAccess(mac.acl, agentId);
  }
}

/**
 * Validate memory (increase crowd confidence)
 */
export function validateMemory(
  memory: Memory,
  validatorAgentId: string
): void {
  if (!memory.multi_agent_context) {
    memory.multi_agent_context = {};
  }

  const mac = memory.multi_agent_context;

  if (!mac.validators) {
    mac.validators = [];
  }

  // Add validator if not already present
  if (!mac.validators.includes(validatorAgentId)) {
    mac.validators.push(validatorAgentId);
  }

  // Update validation count and crowd confidence
  mac.validation_count = mac.validators.length;

  // Calculate crowd confidence based on validators and their trust
  let totalTrust = 0;
  for (const validatorId of mac.validators) {
    const agent = getAgent(validatorId);
    totalTrust += agent?.trust_level || DEFAULT_MULTI_AGENT_CONFIG.default_trust_level;
  }

  mac.crowd_confidence = totalTrust / mac.validators.length;
}

// ============================================================================
// SharedSoulManager - High-level coordination
// ============================================================================

/**
 * Manages shared soul operations across multiple agents
 */
export class SharedSoulManager {
  private config: MultiAgentConfig;

  constructor(config: Partial<MultiAgentConfig> = {}) {
    this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
  }

  /**
   * Process a memory for multi-agent consensus
   */
  processMemory(memory: Memory, allMemories: Memory[]): {
    hasConflicts: boolean;
    conflicts: Array<{ memory: Memory; conflict: ReturnType<typeof detectConflict> }>;
    consensus: ConsensusStatus;
    needsResolution: boolean;
  } {
    const conflicts = findConflicts(memory, allMemories);
    const consensus = calculateConsensus(memory, this.config);
    const needsResolution = consensus === "disputed" && !memory.multi_agent_context?.resolution_method;

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      consensus,
      needsResolution
    };
  }

  /**
   * Attempt automatic conflict resolution
   */
  autoResolve(memory: Memory): boolean {
    if (!this.config.auto_resolve) return false;

    const resolution = resolveByVoting(memory, this.config);

    if (resolution.confidence > 0.7) {
      markResolved(memory, "vote", "system");
      return true;
    }

    return false;
  }

  /**
   * Get agent statistics
   */
  getAgentStats(agentId: string, memories: Memory[]): {
    memoriesCreated: number;
    memoriesContributed: number;
    agreementsGiven: number;
    disputesRaised: number;
    validations: number;
  } {
    let memoriesCreated = 0;
    let memoriesContributed = 0;
    let agreementsGiven = 0;
    let disputesRaised = 0;
    let validations = 0;

    for (const memory of memories) {
      const mac = memory.multi_agent_context;
      if (!mac) continue;

      if (mac.created_by?.agent_id === agentId) {
        memoriesCreated++;
      }

      if (mac.contributors?.some(c => c.agent_id === agentId)) {
        memoriesContributed++;
      }

      if (mac.agreed_by?.includes(agentId)) {
        agreementsGiven++;
      }

      if (mac.disputed_by?.includes(agentId)) {
        disputesRaised++;
      }

      if (mac.validators?.includes(agentId)) {
        validations++;
      }
    }

    return {
      memoriesCreated,
      memoriesContributed,
      agreementsGiven,
      disputesRaised,
      validations
    };
  }
}
