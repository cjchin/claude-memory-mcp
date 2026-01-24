import { describe, it, expect, beforeEach } from "vitest";
import {
  PolicyEngine,
  calculateTrustScore,
  createInitialTrustScore,
  updateTrustScore,
  createProposal,
  isProposalExpired,
  walkerCanPerform,
  ACTION_METADATA,
  WALKER_CAPABILITIES,
  type WalkerAction,
  type TrustScore,
  type Proposal,
} from "../../src/policy.js";

describe("Trust Score Calculation", () => {
  it("should return 0 for no history", () => {
    expect(calculateTrustScore(0, 0, 0)).toBe(0);
  });

  it("should return high score for all approvals", () => {
    const score = calculateTrustScore(20, 0, 0);
    expect(score).toBeGreaterThan(0.9);
  });

  it("should return low score for all rejections", () => {
    const score = calculateTrustScore(0, 20, 0);
    expect(score).toBeLessThan(0.1);
  });

  it("should return ~0.5 for equal approvals and rejections", () => {
    const score = calculateTrustScore(10, 10, 0);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  it("should pull toward 0.3 with low confidence", () => {
    // Only 2 reviews = low confidence
    const score = calculateTrustScore(2, 0, 0);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.5); // Not yet at full approval level
  });

  it("should ignore auto-approved in ratio but count in total", () => {
    // 5 approved, 5 rejected, 10 auto
    const score = calculateTrustScore(5, 5, 10);
    // Should be ~0.5 (5/10 human approval ratio), with 10 reviews = 50% confidence
    // Blends toward 0.3 at low confidence: 0.3 * 0.5 + 0.5 * 0.5 = 0.4
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThanOrEqual(0.5);
  });
});

describe("Trust Score Management", () => {
  it("should create initial trust score with zero values", () => {
    const score = createInitialTrustScore("save_memory");
    expect(score.action).toBe("save_memory");
    expect(score.score).toBe(0);
    expect(score.totalProposals).toBe(0);
    expect(score.approved).toBe(0);
    expect(score.rejected).toBe(0);
    expect(score.autoApproved).toBe(0);
  });

  it("should update trust score on approval", () => {
    const initial = createInitialTrustScore("save_memory");
    const updated = updateTrustScore(initial, "approved");

    expect(updated.approved).toBe(1);
    expect(updated.totalProposals).toBe(1);
    expect(updated.score).toBeGreaterThan(0);
  });

  it("should update trust score on rejection", () => {
    const initial = createInitialTrustScore("delete_memory");
    const updated = updateTrustScore(initial, "rejected");

    expect(updated.rejected).toBe(1);
    expect(updated.totalProposals).toBe(1);
  });

  it("should update trust score on auto-approval", () => {
    const initial = createInitialTrustScore("link_memories");
    const updated = updateTrustScore(initial, "auto");

    expect(updated.autoApproved).toBe(1);
    expect(updated.totalProposals).toBe(1);
  });

  it("should accumulate over multiple updates", () => {
    let score = createInitialTrustScore("tag");
    score = updateTrustScore(score, "approved");
    score = updateTrustScore(score, "approved");
    score = updateTrustScore(score, "rejected");
    score = updateTrustScore(score, "auto");

    expect(score.approved).toBe(2);
    expect(score.rejected).toBe(1);
    expect(score.autoApproved).toBe(1);
    expect(score.totalProposals).toBe(4);
  });
});

describe("Policy Engine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe("Basic Decisions", () => {
    it("should return default decision for unknown action with no trust", () => {
      const decision = engine.decide("delete_memory");
      expect(decision).toBe("review"); // High risk default
    });

    it("should return auto for low-risk actions", () => {
      // Build some trust first
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome("decay", "approved");
      }
      const decision = engine.decide("decay");
      expect(decision).toBe("auto");
    });

    it("should respect explicit overrides", () => {
      const engineWithOverride = new PolicyEngine({
        actionOverrides: { save_memory: "deny" },
      });
      const decision = engineWithOverride.decide("save_memory");
      expect(decision).toBe("deny");
    });
  });

  describe("Trust-Based Decisions", () => {
    it("should require review for low trust", () => {
      const decision = engine.decide("update_memory");
      expect(decision).toBe("review");
    });

    it("should auto-approve after building trust", () => {
      // Build trust for update_memory (needs 0.5)
      for (let i = 0; i < 15; i++) {
        engine.recordOutcome("update_memory", "approved");
      }

      const trustScore = engine.getTrustScore("update_memory");
      expect(trustScore.score).toBeGreaterThan(0.5);

      const decision = engine.decide("update_memory");
      expect(decision).toBe("auto");
    });

    it("should lower trust after rejections", () => {
      // Build some trust
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome("consolidate", "approved");
      }
      const trustBefore = engine.getTrustScore("consolidate").score;

      // Get rejected
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome("consolidate", "rejected");
      }
      const trustAfter = engine.getTrustScore("consolidate").score;

      expect(trustAfter).toBeLessThan(trustBefore);
    });
  });

  describe("Context-Based Decisions", () => {
    it("should require review for high-importance targets", () => {
      // Even with trust built
      for (let i = 0; i < 20; i++) {
        engine.recordOutcome("update_memory", "approved");
      }

      const decision = engine.decide("update_memory", {
        targetImportance: 5,
      });

      expect(decision).toBe("review");
    });

    it("should require review for foundational memory modifications", () => {
      for (let i = 0; i < 20; i++) {
        engine.recordOutcome("update_memory", "approved");
      }

      const decision = engine.decide("update_memory", {
        targetType: "foundational",
      });

      expect(decision).toBe("review");
    });

    it("should allow linking foundational memories with trust", () => {
      for (let i = 0; i < 10; i++) {
        engine.recordOutcome("link_memories", "approved");
      }

      const decision = engine.decide("link_memories", {
        targetType: "foundational",
      });

      // Linking is allowed even for foundational
      expect(decision).toBe("auto");
    });
  });

  describe("Import/Export", () => {
    it("should export trust scores", () => {
      engine.recordOutcome("save_memory", "approved");
      engine.recordOutcome("delete_memory", "rejected");

      const exported = engine.exportTrustScores();

      expect(exported.length).toBe(2);
      expect(exported.find((s) => s.action === "save_memory")).toBeDefined();
      expect(exported.find((s) => s.action === "delete_memory")).toBeDefined();
    });

    it("should import trust scores", () => {
      const scores: TrustScore[] = [
        {
          action: "consolidate",
          score: 0.8,
          totalProposals: 20,
          approved: 18,
          rejected: 2,
          autoApproved: 0,
          lastUpdated: new Date().toISOString(),
        },
      ];

      engine.importTrustScores(scores);

      const imported = engine.getTrustScore("consolidate");
      expect(imported.score).toBe(0.8);
      expect(imported.approved).toBe(18);
    });
  });

  describe("Status Report", () => {
    it("should generate accurate status", () => {
      engine.recordOutcome("save_memory", "approved");
      engine.recordOutcome("save_memory", "auto");
      engine.recordOutcome("delete_memory", "rejected");

      const status = engine.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.totalProposals).toBe(3);
      expect(status.trustScores.length).toBe(2);
    });
  });
});

describe("Proposals", () => {
  it("should create proposal with all fields", () => {
    const proposal = createProposal("consolidate", {
      description: "Merge 3 similar memories about FPGA",
      reason: "Content overlap detected (85% similarity)",
      walkerId: "consolidator_001",
      walkerType: "consolidator",
      targetMemoryIds: ["mem_1", "mem_2", "mem_3"],
    });

    expect(proposal.id).toMatch(/^prop_/);
    expect(proposal.action).toBe("consolidate");
    expect(proposal.status).toBe("pending");
    expect(proposal.targetMemoryIds).toHaveLength(3);
  });

  it("should detect expired proposals", () => {
    const oldProposal: Proposal = {
      id: "prop_old",
      action: "prune",
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
      status: "pending",
      description: "Old proposal",
      reason: "Test",
      walkerId: "pruner_001",
      walkerType: "pruner",
    };

    expect(isProposalExpired(oldProposal)).toBe(true);
  });

  it("should not mark recent proposals as expired", () => {
    const recentProposal = createProposal("link_memories", {
      description: "Link related memories",
      reason: "Semantic similarity",
      walkerId: "linker_001",
      walkerType: "linker",
    });

    expect(isProposalExpired(recentProposal)).toBe(false);
  });

  it("should not expire already-decided proposals", () => {
    const approvedProposal: Proposal = {
      id: "prop_approved",
      action: "tag",
      timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      status: "approved",
      description: "Old but approved",
      reason: "Test",
      walkerId: "tagger_001",
      walkerType: "tagger",
    };

    expect(isProposalExpired(approvedProposal)).toBe(false);
  });
});

describe("Walker Capabilities", () => {
  it("should correctly identify walker capabilities", () => {
    expect(walkerCanPerform("consolidator", "consolidate")).toBe(true);
    expect(walkerCanPerform("consolidator", "delete_memory")).toBe(false);

    expect(walkerCanPerform("linker", "link_memories")).toBe(true);
    expect(walkerCanPerform("linker", "prune")).toBe(false);

    expect(walkerCanPerform("pruner", "prune")).toBe(true);
    expect(walkerCanPerform("pruner", "delete_memory")).toBe(true);
  });

  it("should have all walker types defined", () => {
    const walkerTypes = Object.keys(WALKER_CAPABILITIES);
    expect(walkerTypes).toContain("consolidator");
    expect(walkerTypes).toContain("linker");
    expect(walkerTypes).toContain("decayer");
    expect(walkerTypes).toContain("pruner");
    expect(walkerTypes).toContain("tagger");
    expect(walkerTypes).toContain("contradiction");
    expect(walkerTypes).toContain("summarizer");
  });
});

describe("Action Metadata", () => {
  it("should have metadata for all actions", () => {
    const actions: WalkerAction[] = [
      "save_memory", "update_memory", "delete_memory", "link_memories",
      "consolidate", "decay", "prune", "tag", "reclassify", "supersede",
      "flag_contradiction",
    ];

    for (const action of actions) {
      expect(ACTION_METADATA[action]).toBeDefined();
      expect(ACTION_METADATA[action].risk).toBeDefined();
      expect(ACTION_METADATA[action].reversible).toBeDefined();
      expect(ACTION_METADATA[action].defaultDecision).toBeDefined();
    }
  });

  it("should have appropriate risk levels", () => {
    // High risk actions
    expect(ACTION_METADATA.delete_memory.risk).toBe("high");
    expect(ACTION_METADATA.prune.risk).toBe("high");

    // Low risk actions
    expect(ACTION_METADATA.link_memories.risk).toBe("low");
    expect(ACTION_METADATA.tag.risk).toBe("low");
    expect(ACTION_METADATA.decay.risk).toBe("low");
  });

  it("should mark irreversible actions correctly", () => {
    expect(ACTION_METADATA.delete_memory.reversible).toBe(false);
    expect(ACTION_METADATA.consolidate.reversible).toBe(false);
    expect(ACTION_METADATA.prune.reversible).toBe(false);

    expect(ACTION_METADATA.update_memory.reversible).toBe(true);
    expect(ACTION_METADATA.link_memories.reversible).toBe(true);
  });
});
