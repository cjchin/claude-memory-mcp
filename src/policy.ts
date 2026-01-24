/**
 * Policy Layer - Graduated Autonomy Foundation
 *
 * This module provides the skeleton for:
 * - Action classification (auto-approve vs needs-review vs deny)
 * - Trust tracking per action type
 * - Proposal generation for walker operations
 * - Policy schema and configuration
 *
 * The actual human-in-the-loop review happens externally (via prime, CLI, or future UI).
 * This module provides the logic and tracking.
 */

import type { Memory, MemoryType } from "./types.js";

// ============ ACTION TYPES ============

/**
 * Actions that walkers can propose or execute
 */
export type WalkerAction =
  | "save_memory"         // Save a new memory
  | "update_memory"       // Modify existing memory
  | "delete_memory"       // Remove a memory
  | "link_memories"       // Create bidirectional links
  | "consolidate"         // Merge similar memories
  | "decay"               // Apply importance decay
  | "prune"               // Archive low-value memories
  | "tag"                 // Add/modify tags
  | "reclassify"          // Change memory type
  | "supersede"           // Mark memory as superseded
  | "flag_contradiction"; // Flag potential conflict

/**
 * Risk level of an action - determines default policy
 */
export type ActionRisk = "low" | "medium" | "high" | "critical";

/**
 * Decision for an action
 */
export type PolicyDecision = "auto" | "review" | "deny";

// ============ ACTION METADATA ============

interface ActionMetadata {
  risk: ActionRisk;
  reversible: boolean;
  description: string;
  defaultDecision: PolicyDecision;
  minTrustForAuto: number;  // Trust score needed for auto-approval (0-1)
}

/**
 * Metadata for each action type
 */
export const ACTION_METADATA: Record<WalkerAction, ActionMetadata> = {
  save_memory: {
    risk: "low",
    reversible: true,
    description: "Create a new memory",
    defaultDecision: "auto",
    minTrustForAuto: 0.3,
  },
  update_memory: {
    risk: "medium",
    reversible: true,
    description: "Modify existing memory content or metadata",
    defaultDecision: "review",
    minTrustForAuto: 0.5,
  },
  delete_memory: {
    risk: "high",
    reversible: false,
    description: "Permanently remove a memory",
    defaultDecision: "review",
    minTrustForAuto: 0.8,
  },
  link_memories: {
    risk: "low",
    reversible: true,
    description: "Create bidirectional relationship between memories",
    defaultDecision: "auto",
    minTrustForAuto: 0.2,
  },
  consolidate: {
    risk: "medium",
    reversible: false,
    description: "Merge multiple memories into one",
    defaultDecision: "review",
    minTrustForAuto: 0.6,
  },
  decay: {
    risk: "low",
    reversible: true,
    description: "Reduce importance of aging memories",
    defaultDecision: "auto",
    minTrustForAuto: 0.1,
  },
  prune: {
    risk: "high",
    reversible: false,
    description: "Archive or remove low-value memories",
    defaultDecision: "review",
    minTrustForAuto: 0.7,
  },
  tag: {
    risk: "low",
    reversible: true,
    description: "Add or modify memory tags",
    defaultDecision: "auto",
    minTrustForAuto: 0.2,
  },
  reclassify: {
    risk: "medium",
    reversible: true,
    description: "Change memory type classification",
    defaultDecision: "review",
    minTrustForAuto: 0.5,
  },
  supersede: {
    risk: "medium",
    reversible: true,
    description: "Mark a memory as replaced by newer information",
    defaultDecision: "review",
    minTrustForAuto: 0.5,
  },
  flag_contradiction: {
    risk: "low",
    reversible: true,
    description: "Flag potential conflict between memories",
    defaultDecision: "auto",
    minTrustForAuto: 0.1,
  },
};

// ============ TRUST TRACKING ============

/**
 * Trust score for a specific action type
 * Built from history of approvals/rejections
 */
export interface TrustScore {
  action: WalkerAction;
  score: number;           // 0-1, current trust level
  totalProposals: number;  // Total proposals made
  approved: number;        // Number approved by human
  rejected: number;        // Number rejected by human
  autoApproved: number;    // Number auto-approved
  lastUpdated: string;     // ISO timestamp
}

/**
 * Calculate trust score from approval history
 * Uses a simple ratio with recency weighting
 */
export function calculateTrustScore(
  approved: number,
  rejected: number,
  autoApproved: number
): number {
  const total = approved + rejected + autoApproved;
  if (total === 0) return 0;

  // Base score: approval ratio
  const humanReviewed = approved + rejected;
  const approvalRatio = humanReviewed > 0 ? approved / humanReviewed : 0.5;

  // Confidence: more reviews = more confident in the score
  const confidence = Math.min(humanReviewed / 20, 1); // Max confidence at 20 reviews

  // Blend: low confidence pulls toward 0.3 (cautious default)
  return 0.3 * (1 - confidence) + approvalRatio * confidence;
}

/**
 * Create initial trust score for an action
 */
export function createInitialTrustScore(action: WalkerAction): TrustScore {
  return {
    action,
    score: 0,
    totalProposals: 0,
    approved: 0,
    rejected: 0,
    autoApproved: 0,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update trust score after a decision
 */
export function updateTrustScore(
  current: TrustScore,
  decision: "approved" | "rejected" | "auto"
): TrustScore {
  const updated = { ...current };

  updated.totalProposals++;
  updated.lastUpdated = new Date().toISOString();

  switch (decision) {
    case "approved":
      updated.approved++;
      break;
    case "rejected":
      updated.rejected++;
      break;
    case "auto":
      updated.autoApproved++;
      break;
  }

  updated.score = calculateTrustScore(
    updated.approved,
    updated.rejected,
    updated.autoApproved
  );

  return updated;
}

// ============ POLICY ENGINE ============

/**
 * Policy configuration
 */
export interface PolicyConfig {
  // Global settings
  enabled: boolean;                    // Is policy enforcement on?
  defaultDecision: PolicyDecision;     // Default if no rule matches
  requireReviewForCritical: boolean;   // Always review critical actions?

  // Trust thresholds (override action-specific)
  globalMinTrustForAuto?: number;      // Global minimum trust for auto

  // Action-specific overrides
  actionOverrides: Partial<Record<WalkerAction, PolicyDecision>>;
}

const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  enabled: true,
  defaultDecision: "review",
  requireReviewForCritical: true,
  actionOverrides: {},
};

/**
 * Policy engine - makes decisions about actions
 */
export class PolicyEngine {
  private config: PolicyConfig;
  private trustScores: Map<WalkerAction, TrustScore>;

  constructor(config: Partial<PolicyConfig> = {}) {
    this.config = { ...DEFAULT_POLICY_CONFIG, ...config };
    this.trustScores = new Map();
  }

  /**
   * Get current trust score for an action
   */
  getTrustScore(action: WalkerAction): TrustScore {
    if (!this.trustScores.has(action)) {
      this.trustScores.set(action, createInitialTrustScore(action));
    }
    return this.trustScores.get(action)!;
  }

  /**
   * Set trust score (for loading from storage)
   */
  setTrustScore(score: TrustScore): void {
    this.trustScores.set(score.action, score);
  }

  /**
   * Make a policy decision for an action
   */
  decide(action: WalkerAction, context?: ActionContext): PolicyDecision {
    if (!this.config.enabled) {
      return "auto"; // Policy disabled, allow everything
    }

    const metadata = ACTION_METADATA[action];
    const trustScore = this.getTrustScore(action);

    // Check for explicit override
    if (this.config.actionOverrides[action]) {
      return this.config.actionOverrides[action]!;
    }

    // Critical actions always need review if configured
    if (this.config.requireReviewForCritical && metadata.risk === "critical") {
      return "review";
    }

    // Context-based checks BEFORE trust (these override trust)
    if (context) {
      // High importance memories need more review
      if (context.targetImportance && context.targetImportance >= 4) {
        return "review";
      }

      // Foundational memories always need review for modifications
      if (context.targetType === "foundational" && action !== "link_memories") {
        return "review";
      }
    }

    // Check trust level
    const minTrust = this.config.globalMinTrustForAuto ?? metadata.minTrustForAuto;
    if (trustScore.score >= minTrust) {
      return "auto";
    }

    return metadata.defaultDecision;
  }

  /**
   * Record outcome of a proposal
   */
  recordOutcome(
    action: WalkerAction,
    decision: "approved" | "rejected" | "auto"
  ): void {
    const current = this.getTrustScore(action);
    const updated = updateTrustScore(current, decision);
    this.trustScores.set(action, updated);
  }

  /**
   * Export all trust scores (for persistence)
   */
  exportTrustScores(): TrustScore[] {
    return Array.from(this.trustScores.values());
  }

  /**
   * Import trust scores (from storage)
   */
  importTrustScores(scores: TrustScore[]): void {
    for (const score of scores) {
      this.trustScores.set(score.action, score);
    }
  }

  /**
   * Get policy status summary
   */
  getStatus(): PolicyStatus {
    const scores = this.exportTrustScores();
    const totalProposals = scores.reduce((sum, s) => sum + s.totalProposals, 0);
    const totalApproved = scores.reduce((sum, s) => sum + s.approved, 0);
    const totalRejected = scores.reduce((sum, s) => sum + s.rejected, 0);

    return {
      enabled: this.config.enabled,
      totalProposals,
      approvalRate: totalProposals > 0
        ? (totalApproved + scores.reduce((sum, s) => sum + s.autoApproved, 0)) / totalProposals
        : 0,
      humanReviewRate: totalProposals > 0
        ? (totalApproved + totalRejected) / totalProposals
        : 0,
      trustScores: scores,
    };
  }
}

/**
 * Context for making policy decisions
 */
export interface ActionContext {
  targetMemoryId?: string;
  targetType?: MemoryType;
  targetImportance?: number;
  reason?: string;
  proposedBy?: string;  // "walker" | "user" | specific walker ID
}

/**
 * Policy status summary
 */
export interface PolicyStatus {
  enabled: boolean;
  totalProposals: number;
  approvalRate: number;
  humanReviewRate: number;
  trustScores: TrustScore[];
}

// ============ PROPOSALS ============

/**
 * A proposal from a walker for human review
 */
export interface Proposal {
  id: string;
  action: WalkerAction;
  timestamp: string;
  status: "pending" | "approved" | "rejected" | "auto" | "expired";

  // What the walker wants to do
  description: string;
  reason: string;

  // Target of the action
  targetMemoryIds?: string[];
  proposedContent?: string;
  proposedChanges?: Record<string, unknown>;

  // Walker info
  walkerId: string;
  walkerType: string;

  // Review info (filled after decision)
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

/**
 * Generate a proposal ID
 */
export function generateProposalId(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new proposal
 */
export function createProposal(
  action: WalkerAction,
  params: {
    description: string;
    reason: string;
    walkerId: string;
    walkerType: string;
    targetMemoryIds?: string[];
    proposedContent?: string;
    proposedChanges?: Record<string, unknown>;
  }
): Proposal {
  return {
    id: generateProposalId(),
    action,
    timestamp: new Date().toISOString(),
    status: "pending",
    ...params,
  };
}

/**
 * Check if a proposal has expired (default: 7 days)
 */
export function isProposalExpired(
  proposal: Proposal,
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): boolean {
  if (proposal.status !== "pending") return false;
  const age = Date.now() - new Date(proposal.timestamp).getTime();
  return age > maxAgeMs;
}

// ============ WALKER TYPES ============

/**
 * Walker types and their capabilities
 */
export type WalkerType =
  | "consolidator"    // Merges similar memories
  | "linker"          // Discovers and creates links
  | "decayer"         // Applies temporal decay
  | "pruner"          // Removes low-value content
  | "tagger"          // Improves tagging
  | "contradiction"   // Finds conflicts
  | "summarizer";     // Creates summaries

/**
 * Walker capability matrix
 */
export const WALKER_CAPABILITIES: Record<WalkerType, WalkerAction[]> = {
  consolidator: ["consolidate", "link_memories", "supersede"],
  linker: ["link_memories", "tag"],
  decayer: ["decay", "update_memory"],
  pruner: ["prune", "delete_memory", "flag_contradiction"],
  tagger: ["tag", "reclassify"],
  contradiction: ["flag_contradiction", "supersede"],
  summarizer: ["save_memory", "link_memories"],
};

/**
 * Check if a walker can perform an action
 */
export function walkerCanPerform(walker: WalkerType, action: WalkerAction): boolean {
  return WALKER_CAPABILITIES[walker]?.includes(action) ?? false;
}
