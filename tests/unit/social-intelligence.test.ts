/**
 * Social Intelligence Unit Tests
 *
 * Tests for collective knowledge, endorsements, and social proof.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  addEndorsement,
  removeEndorsement,
  getEndorsementsByType,
  getEndorsementCount,
  recordDiffusion,
  getDiffusionReach,
  calculateDiffusionVelocity,
  calculateConsensusLevel,
  calculateControversyScore,
  detectConsensus,
  calculateInfluenceScores,
  calculateQualityScore,
  identifyThoughtLeaders,
  identifyDomainExperts,
  calculateTrendingScore,
  isTrending,
  updateSocialMetrics,
  getCollectiveIntelligenceSummary,
  DEFAULT_SOCIAL_CONFIG,
} from "../../src/social-intelligence.js";
import type { Memory, Endorsement } from "../../src/types.js";

// Test helpers
function createMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem_${Math.random().toString(36).slice(2, 9)}`,
    content: "Test memory content",
    type: "learning",
    tags: ["test"],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    ...overrides,
  };
}

describe("Social Intelligence - Endorsement Management", () => {
  it("should add endorsement to memory", () => {
    const memory = createMemory();
    const updated = addEndorsement(memory, "agent_1", "verified", "Looks good", 0.9);

    expect(updated.social_context?.endorsements).toHaveLength(1);
    expect(updated.social_context?.endorsements?.[0]).toMatchObject({
      agent_id: "agent_1",
      type: "verified",
      comment: "Looks good",
      weight: 0.9,
    });
    expect(updated.social_context?.endorsement_summary?.verified).toBe(1);
  });

  it("should update existing endorsement from same agent", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_1", "outdated", "No longer relevant");

    expect(memory.social_context?.endorsements).toHaveLength(1);
    expect(memory.social_context?.endorsements?.[0].type).toBe("outdated");
    expect(memory.social_context?.endorsement_summary?.verified).toBe(0);
    expect(memory.social_context?.endorsement_summary?.outdated).toBe(1);
  });

  it("should remove endorsement", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");

    memory = removeEndorsement(memory, "agent_1");

    expect(memory.social_context?.endorsements).toHaveLength(1);
    expect(memory.social_context?.endorsements?.[0].agent_id).toBe("agent_2");
    expect(memory.social_context?.endorsement_summary?.verified).toBe(0);
    expect(memory.social_context?.endorsement_summary?.useful).toBe(1);
  });

  it("should get endorsements by type", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "verified");
    memory = addEndorsement(memory, "agent_3", "useful");

    const verified = getEndorsementsByType(memory, "verified");
    expect(verified).toHaveLength(2);
    expect(verified.every((e) => e.type === "verified")).toBe(true);
  });

  it("should get total endorsement count", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");
    memory = addEndorsement(memory, "agent_3", "important");

    expect(getEndorsementCount(memory)).toBe(3);
  });

  it("should handle endorsement summary correctly", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");
    memory = addEndorsement(memory, "agent_3", "important");
    memory = addEndorsement(memory, "agent_4", "question");
    memory = addEndorsement(memory, "agent_5", "outdated");

    const summary = memory.social_context?.endorsement_summary;
    expect(summary).toEqual({
      verified: 1,
      useful: 1,
      important: 1,
      questioned: 1,
      outdated: 1,
    });
  });
});

describe("Social Intelligence - Knowledge Diffusion", () => {
  it("should record diffusion path", () => {
    let memory = createMemory({
      social_context: { discoverer: "agent_0" },
    });

    memory = recordDiffusion(memory, "agent_0", "agent_1", "share");
    memory = recordDiffusion(memory, "agent_1", "agent_2", "cite");

    expect(memory.social_context?.diffusion_paths).toHaveLength(2);
    expect(memory.social_context?.reach).toBe(3); // agent_0, agent_1, agent_2
  });

  it("should calculate diffusion reach correctly", () => {
    let memory = createMemory({
      social_context: { discoverer: "agent_0" },
    });

    memory = recordDiffusion(memory, "agent_0", "agent_1", "share");
    memory = recordDiffusion(memory, "agent_1", "agent_2", "cite");
    memory = recordDiffusion(memory, "agent_2", "agent_3", "reference");

    expect(getDiffusionReach(memory)).toBe(4); // 0, 1, 2, 3
  });

  it("should calculate diffusion velocity", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const memory = createMemory({
      social_context: {
        diffusion_paths: [
          {
            from_agent: "agent_0",
            to_agent: "agent_1",
            timestamp: oneHourAgo.toISOString(),
            mechanism: "share",
          },
          {
            from_agent: "agent_1",
            to_agent: "agent_2",
            timestamp: now.toISOString(),
            mechanism: "cite",
          },
        ],
      },
    });

    const velocity = calculateDiffusionVelocity(memory);
    expect(velocity).toBeGreaterThan(0);
    expect(velocity).toBeLessThanOrEqual(2); // 2 paths in 1+ hour
  });

  it("should handle zero diffusion velocity", () => {
    const memory = createMemory();
    expect(calculateDiffusionVelocity(memory)).toBe(0);
  });
});

describe("Social Intelligence - Consensus Detection", () => {
  it("should calculate consensus level", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "verified");
    memory = addEndorsement(memory, "agent_3", "verified");
    memory = addEndorsement(memory, "agent_4", "question");

    const consensus = calculateConsensusLevel(memory);
    expect(consensus).toBe(0.75); // 3/4 positive
  });

  it("should return 0 for insufficient endorsements", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");

    const consensus = calculateConsensusLevel(memory);
    expect(consensus).toBe(0); // < min_endorsements_for_consensus (3)
  });

  it("should calculate controversy score", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "verified");
    memory = addEndorsement(memory, "agent_3", "question");
    memory = addEndorsement(memory, "agent_4", "outdated");

    const controversy = calculateControversyScore(memory);
    expect(controversy).toBe(0.5); // 2/4 negative
  });

  it("should detect strong consensus", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");
    memory = addEndorsement(memory, "agent_3", "important");
    memory = addEndorsement(memory, "agent_4", "verified");

    const status = detectConsensus(memory);
    expect(status).toBe("strong_consensus"); // 100% positive >= 75%
  });

  it("should detect weak consensus", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");
    memory = addEndorsement(memory, "agent_3", "question");

    const status = detectConsensus(memory);
    expect(status).toBe("weak_consensus"); // 66% positive >= 50% but < 75%
  });

  it("should detect controversial", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "question");
    memory = addEndorsement(memory, "agent_3", "outdated");

    const status = detectConsensus(memory);
    expect(status).toBe("controversial"); // 66% negative >= 40%
  });

  it("should detect insufficient data", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");

    const status = detectConsensus(memory);
    expect(status).toBe("insufficient_data");
  });
});

describe("Social Intelligence - Influence Calculation", () => {
  it("should calculate influence scores using PageRank", () => {
    const mem1 = createMemory({ id: "mem_1", related_memories: ["mem_2", "mem_3"] });
    const mem2 = createMemory({ id: "mem_2", related_memories: ["mem_3"] });
    const mem3 = createMemory({ id: "mem_3", related_memories: [] });

    const memories = [mem1, mem2, mem3];
    const scores = calculateInfluenceScores(memories);

    expect(scores.size).toBe(3);
    expect(scores.get("mem_3")).toBeGreaterThan(scores.get("mem_1")!);
    expect(scores.get("mem_3")).toBeGreaterThan(scores.get("mem_2")!);
    // mem_3 is cited by both mem_1 and mem_2, so highest influence
  });

  it("should handle memories with no links", () => {
    const mem1 = createMemory({ id: "mem_1" });
    const mem2 = createMemory({ id: "mem_2" });

    const scores = calculateInfluenceScores([mem1, mem2]);

    expect(scores.size).toBe(2);
    // All scores should be equal for isolated nodes
    expect(Math.abs(scores.get("mem_1")! - scores.get("mem_2")!)).toBeLessThan(0.01);
  });

  it("should converge within max iterations", () => {
    const memories: Memory[] = [];
    for (let i = 0; i < 10; i++) {
      memories.push(
        createMemory({
          id: `mem_${i}`,
          related_memories: i > 0 ? [`mem_${i - 1}`] : [],
        })
      );
    }

    const scores = calculateInfluenceScores(memories);
    expect(scores.size).toBe(10);
  });
});

describe("Social Intelligence - Quality Metrics", () => {
  it("should calculate quality score", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified", undefined, 0.9);
    memory = addEndorsement(memory, "agent_2", "useful", undefined, 0.8);
    memory = addEndorsement(memory, "agent_3", "important", undefined, 0.85);

    memory = recordDiffusion(memory, "agent_1", "agent_4", "share");
    memory = recordDiffusion(memory, "agent_4", "agent_5", "cite");

    const quality = calculateQualityScore(memory);
    expect(quality).toBeGreaterThan(0.5);
    expect(quality).toBeLessThanOrEqual(1.0);
  });

  it("should return neutral quality for memory without social context", () => {
    const memory = createMemory();
    const quality = calculateQualityScore(memory);
    expect(quality).toBe(0.5);
  });

  it("should weight endorsements correctly", () => {
    let memory1 = createMemory();
    memory1 = addEndorsement(memory1, "agent_1", "verified", undefined, 0.9);
    memory1 = addEndorsement(memory1, "agent_2", "verified", undefined, 0.9);
    memory1 = addEndorsement(memory1, "agent_3", "verified", undefined, 0.9);

    let memory2 = createMemory();
    memory2 = addEndorsement(memory2, "agent_1", "verified", undefined, 0.3);
    memory2 = addEndorsement(memory2, "agent_2", "verified", undefined, 0.3);
    memory2 = addEndorsement(memory2, "agent_3", "verified", undefined, 0.3);

    const quality1 = calculateQualityScore(memory1);
    const quality2 = calculateQualityScore(memory2);

    expect(quality1).toBeGreaterThan(quality2); // Higher trust = higher quality
  });
});

describe("Social Intelligence - Thought Leadership", () => {
  it("should identify thought leaders", () => {
    let memory = createMemory();

    // Add 6 endorsements from agent_1 (5 verified/important)
    memory.social_context = {
      endorsements: [
        { agent_id: "agent_1", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_1", type: "important", timestamp: new Date().toISOString() },
        { agent_id: "agent_1", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_1", type: "important", timestamp: new Date().toISOString() },
        { agent_id: "agent_1", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_1", type: "useful", timestamp: new Date().toISOString() },

        // Add 6 endorsements from agent_2 (5 verified/important)
        { agent_id: "agent_2", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_2", type: "important", timestamp: new Date().toISOString() },
        { agent_id: "agent_2", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_2", type: "important", timestamp: new Date().toISOString() },
        { agent_id: "agent_2", type: "verified", timestamp: new Date().toISOString() },
        { agent_id: "agent_2", type: "useful", timestamp: new Date().toISOString() },

        // Add 2 endorsements from agent_3 (not enough)
        { agent_id: "agent_3", type: "useful", timestamp: new Date().toISOString() },
        { agent_id: "agent_3", type: "useful", timestamp: new Date().toISOString() },
      ],
    };

    const leaders = identifyThoughtLeaders(memory);
    expect(leaders).toContain("agent_1");
    expect(leaders).toContain("agent_2");
    expect(leaders).not.toContain("agent_3");
  });

  it("should identify domain experts", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified", undefined, 0.9);
    memory = addEndorsement(memory, "agent_2", "verified", undefined, 0.85);
    memory = addEndorsement(memory, "agent_3", "verified", undefined, 0.5);
    memory = addEndorsement(memory, "agent_4", "useful", undefined, 0.95);

    const experts = identifyDomainExperts(memory);
    expect(experts).toContain("agent_1"); // trust >= 0.8 and verified
    expect(experts).toContain("agent_2"); // trust >= 0.8 and verified
    expect(experts).not.toContain("agent_3"); // trust < 0.8
    expect(experts).not.toContain("agent_4"); // not verified
  });

  it("should handle no thought leaders", () => {
    let memory = createMemory();
    memory = addEndorsement(memory, "agent_1", "verified");
    memory = addEndorsement(memory, "agent_2", "useful");

    const leaders = identifyThoughtLeaders(memory);
    expect(leaders).toHaveLength(0);
  });
});

describe("Social Intelligence - Trending Detection", () => {
  it("should calculate trending score", () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    let memory = createMemory();

    // Add old endorsements
    memory.social_context = {
      endorsements: [
        {
          agent_id: "agent_1",
          type: "verified",
          timestamp: twoDaysAgo.toISOString(),
        },
      ],
    };

    // Add many recent endorsements
    for (let i = 2; i <= 5; i++) {
      memory = addEndorsement(memory, `agent_${i}`, "verified");
    }

    const trending = calculateTrendingScore(memory);
    expect(trending).toBeGreaterThan(0.5); // 4 recent vs 1 old = 4x ratio
  });

  it("should detect trending memory", () => {
    let memory = createMemory();
    memory.social_context = {
      endorsements: [
        {
          agent_id: "agent_1",
          type: "verified",
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };

    for (let i = 2; i <= 4; i++) {
      memory = addEndorsement(memory, `agent_${i}`, "verified");
    }

    expect(isTrending(memory)).toBe(true);
  });

  it("should not detect trending for old memory", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const memory = createMemory({
      social_context: {
        endorsements: [
          {
            agent_id: "agent_1",
            type: "verified",
            timestamp: twoDaysAgo.toISOString(),
          },
          {
            agent_id: "agent_2",
            type: "verified",
            timestamp: twoDaysAgo.toISOString(),
          },
        ],
      },
    });

    expect(isTrending(memory)).toBe(false);
  });
});

describe("Social Intelligence - Social Metrics Update", () => {
  it("should update all social metrics", () => {
    let memory = createMemory({ id: "mem_1", related_memories: ["mem_2"] });
    memory = addEndorsement(memory, "agent_1", "verified", undefined, 0.9);
    memory = addEndorsement(memory, "agent_2", "useful", undefined, 0.8);
    memory = addEndorsement(memory, "agent_3", "important", undefined, 0.85);

    const mem2 = createMemory({ id: "mem_2", related_memories: [] });

    const updated = updateSocialMetrics(memory, [memory, mem2]);

    expect(updated.social_context?.consensus_level).toBeDefined();
    expect(updated.social_context?.quality_score).toBeDefined();
    expect(updated.social_context?.trending_score).toBeDefined();
    expect(updated.social_context?.influence_score).toBeDefined();
    expect(updated.social_context?.stability_score).toBeDefined();
    expect(updated.social_context?.thought_leaders).toBeDefined();
    expect(updated.social_context?.domain_experts).toBeDefined();
    expect(updated.social_context?.last_social_update).toBeDefined();
    expect(updated.social_context?.computed_by).toBe("social_intelligence_module");
  });
});

describe("Social Intelligence - Collective Intelligence", () => {
  it("should generate collective intelligence summary", () => {
    let mem1 = createMemory({ id: "mem_1" });
    mem1 = addEndorsement(mem1, "agent_1", "verified");
    mem1 = addEndorsement(mem1, "agent_2", "useful");
    mem1 = addEndorsement(mem1, "agent_3", "important");

    let mem2 = createMemory({ id: "mem_2" });
    mem2 = addEndorsement(mem2, "agent_1", "verified");
    mem2 = addEndorsement(mem2, "agent_2", "question");
    mem2 = addEndorsement(mem2, "agent_3", "outdated");

    mem1 = updateSocialMetrics(mem1, [mem1, mem2]);
    mem2 = updateSocialMetrics(mem2, [mem1, mem2]);

    const summary = getCollectiveIntelligenceSummary([mem1, mem2]);

    expect(summary.total_memories).toBe(2);
    expect(summary.total_endorsements).toBe(6);
    expect(summary.average_quality).toBeGreaterThan(0);
    expect(summary.high_consensus_count).toBeGreaterThanOrEqual(0);
    expect(summary.controversial_count).toBeGreaterThanOrEqual(0);
    expect(summary.top_influencers).toBeDefined();
    expect(summary.thought_leaders).toBeInstanceOf(Map);
  });

  it("should identify top influencers", () => {
    const mem1 = createMemory({ id: "mem_1", related_memories: ["mem_3"] });
    const mem2 = createMemory({ id: "mem_2", related_memories: ["mem_3"] });
    const mem3 = createMemory({ id: "mem_3", related_memories: [] });

    const summary = getCollectiveIntelligenceSummary([mem1, mem2, mem3]);

    expect(summary.top_influencers.length).toBeGreaterThan(0);
    expect(summary.top_influencers[0].memory_id).toBe("mem_3");
    expect(summary.top_influencers[0].influence).toBeGreaterThan(0);
  });

  it("should track thought leader counts", () => {
    let mem1 = createMemory();
    mem1.social_context = {
      thought_leaders: ["agent_1", "agent_2"],
    };

    let mem2 = createMemory();
    mem2.social_context = {
      thought_leaders: ["agent_1", "agent_3"],
    };

    const summary = getCollectiveIntelligenceSummary([mem1, mem2]);

    expect(summary.thought_leaders.get("agent_1")).toBe(2);
    expect(summary.thought_leaders.get("agent_2")).toBe(1);
    expect(summary.thought_leaders.get("agent_3")).toBe(1);
  });
});
