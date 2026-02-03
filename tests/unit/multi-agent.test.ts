/**
 * Multi-Agent Intelligence Tests - v3.0 Phase 3
 *
 * Tests for agent registration, conflict detection, consensus building, and access control.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerAgent,
  getAgent,
  listAgents,
  setAgentTrust,
  updateAgentActivity,
  canRead,
  canWrite,
  createDefaultACL,
  grantReadAccess,
  grantWriteAccess,
  detectConflict,
  findConflicts,
  calculateConsensus,
  voteOnMemory,
  resolveByVoting,
  markResolved,
  addContributor,
  shareMemoryWith,
  validateMemory,
  SharedSoulManager,
  DEFAULT_MULTI_AGENT_CONFIG
} from "../../src/multi-agent.js";
import type { Memory, AgentIdentity, MemoryACL } from "../../src/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createAgent(overrides: Partial<AgentIdentity> = {}): AgentIdentity {
  return {
    agent_id: `agent_${Math.random().toString(36).substr(2, 9)}`,
    agent_type: "claude",
    trust_level: 0.8,
    ...overrides
  };
}

function createMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem_${Math.random().toString(36).substr(2, 9)}`,
    content: "Test memory content",
    type: "learning",
    tags: [],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    ...overrides
  };
}

// ============================================================================
// Agent Registration Tests
// ============================================================================

describe("Multi-Agent Intelligence - Agent Registration", () => {
  it("should register a new agent", () => {
    const agent = createAgent({
      agent_id: "test_agent_1",
      agent_name: "Test Agent"
    });

    const registered = registerAgent(agent);

    expect(registered.agent_id).toBe("test_agent_1");
    expect(registered.agent_name).toBe("Test Agent");
    expect(registered.created_at).toBeDefined();
    expect(registered.last_active).toBeDefined();
  });

  it("should apply default trust level if not specified", () => {
    const agent = createAgent({
      agent_id: "test_agent_2",
      trust_level: undefined
    });

    const registered = registerAgent(agent);

    expect(registered.trust_level).toBe(DEFAULT_MULTI_AGENT_CONFIG.default_trust_level);
  });

  it("should retrieve registered agent by ID", () => {
    const agent = createAgent({ agent_id: "test_agent_3" });
    registerAgent(agent);

    const retrieved = getAgent("test_agent_3");

    expect(retrieved).toBeDefined();
    expect(retrieved?.agent_id).toBe("test_agent_3");
  });

  it("should list all registered agents", () => {
    const agent1 = createAgent({ agent_id: "list_test_1" });
    const agent2 = createAgent({ agent_id: "list_test_2" });

    registerAgent(agent1);
    registerAgent(agent2);

    const agents = listAgents();

    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.some(a => a.agent_id === "list_test_1")).toBe(true);
    expect(agents.some(a => a.agent_id === "list_test_2")).toBe(true);
  });

  it("should update agent trust level", () => {
    const agent = createAgent({ agent_id: "trust_test", trust_level: 0.5 });
    registerAgent(agent);

    setAgentTrust("trust_test", 0.9);

    const updated = getAgent("trust_test");
    expect(updated?.trust_level).toBe(0.9);
  });

  it("should clamp trust level to 0-1 range", () => {
    const agent = createAgent({ agent_id: "clamp_test" });
    registerAgent(agent);

    setAgentTrust("clamp_test", 1.5);
    expect(getAgent("clamp_test")?.trust_level).toBe(1);

    setAgentTrust("clamp_test", -0.5);
    expect(getAgent("clamp_test")?.trust_level).toBe(0);
  });

  it("should update last active timestamp", () => {
    const agent = createAgent({ agent_id: "activity_test" });
    registerAgent(agent);

    const initialTime = getAgent("activity_test")?.last_active;

    // Wait a bit to ensure timestamp changes
    setTimeout(() => {
      updateAgentActivity("activity_test");
      const updatedTime = getAgent("activity_test")?.last_active;
      expect(updatedTime).not.toBe(initialTime);
    }, 10);
  });
});

// ============================================================================
// Access Control Tests
// ============================================================================

describe("Multi-Agent Intelligence - Access Control", () => {
  it("should allow read access to public memory", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: {
          owner: "agent_1",
          read_access: [],
          write_access: ["agent_1"],
          visibility: "public"
        }
      }
    });

    expect(canRead(memory, "agent_2")).toBe(true);
  });

  it("should deny read access to private memory", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: {
          owner: "agent_1",
          read_access: ["agent_1"],
          write_access: ["agent_1"],
          visibility: "private"
        }
      }
    });

    expect(canRead(memory, "agent_2")).toBe(false);
  });

  it("should allow owner to read private memory", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: {
          owner: "agent_1",
          read_access: ["agent_1"],
          write_access: ["agent_1"],
          visibility: "private"
        }
      }
    });

    expect(canRead(memory, "agent_1")).toBe(true);
  });

  it("should allow write access to owner", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: {
          owner: "agent_1",
          read_access: [],
          write_access: ["agent_1"],
          visibility: "team"
        }
      }
    });

    expect(canWrite(memory, "agent_1")).toBe(true);
  });

  it("should deny write access to non-owner", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: {
          owner: "agent_1",
          read_access: [],
          write_access: ["agent_1"],
          visibility: "team"
        }
      }
    });

    expect(canWrite(memory, "agent_2")).toBe(false);
  });

  it("should create default ACL with correct visibility", () => {
    const acl = createDefaultACL("agent_1", "private");

    expect(acl.owner).toBe("agent_1");
    expect(acl.visibility).toBe("private");
    expect(acl.read_access).toContain("agent_1");
    expect(acl.write_access).toContain("agent_1");
  });

  it("should grant read access", () => {
    const acl = createDefaultACL("agent_1", "private");

    grantReadAccess(acl, "agent_2");

    expect(acl.read_access).toContain("agent_2");
  });

  it("should grant write access", () => {
    const acl = createDefaultACL("agent_1", "private");

    grantWriteAccess(acl, "agent_2");

    expect(acl.write_access).toContain("agent_2");
  });
});

// ============================================================================
// Conflict Detection Tests
// ============================================================================

describe("Multi-Agent Intelligence - Conflict Detection", () => {
  it("should detect supersedes conflict from different agents", () => {
    const agent1 = createAgent({ agent_id: "agent_conflict_1" });
    const agent2 = createAgent({ agent_id: "agent_conflict_2" });

    const memory1 = createMemory({
      id: "mem_conflict_1",
      content: "Original memory",
      multi_agent_context: {
        created_by: agent1
      }
    });

    const memory2 = createMemory({
      id: "mem_conflict_2",
      content: "Superseding memory",
      supersedes: "mem_conflict_1",
      multi_agent_context: {
        created_by: agent2
      }
    });

    const conflict = detectConflict(memory1, memory2);

    expect(conflict.hasConflict).toBe(true);
    expect(conflict.conflictType).toBe("supersedes");
    expect(conflict.confidence).toBeGreaterThan(0.5);
  });

  it("should not detect conflict for supersedes by same agent", () => {
    const agent = createAgent({ agent_id: "agent_same" });

    const memory1 = createMemory({
      id: "mem_same_1",
      multi_agent_context: {
        created_by: agent
      }
    });

    const memory2 = createMemory({
      id: "mem_same_2",
      supersedes: "mem_same_1",
      multi_agent_context: {
        created_by: agent
      }
    });

    const conflict = detectConflict(memory1, memory2);

    expect(conflict.hasConflict).toBe(false);
  });

  it("should detect content contradiction", () => {
    const memory1 = createMemory({
      content: "This feature is always enabled",
      tags: ["feature", "config"],
      valid_from: "2024-01-01T00:00:00Z"
    });

    const memory2 = createMemory({
      content: "This feature is never enabled",
      tags: ["feature", "config"],
      valid_from: "2024-01-01T00:00:00Z"
    });

    const conflict = detectConflict(memory1, memory2);

    expect(conflict.hasConflict).toBe(true);
    expect(conflict.conflictType).toBe("content");
  });

  it("should find all conflicts for a memory", () => {
    const memory = createMemory({
      id: "target",
      content: "The bug is fixed",
      tags: ["bug", "fix"],
      valid_from: "2024-01-01T00:00:00Z"
    });

    const other1 = createMemory({
      id: "other1",
      content: "The bug is not fixed",
      tags: ["bug", "fix"],
      valid_from: "2024-01-01T00:00:00Z"
    });

    const other2 = createMemory({
      id: "other2",
      content: "Unrelated memory",
      tags: ["different"]
    });

    const allMemories = [memory, other1, other2];
    const conflicts = findConflicts(memory, allMemories, 0.3);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some(c => c.memory.id === "other1")).toBe(true);
  });
});

// ============================================================================
// Consensus Building Tests
// ============================================================================

describe("Multi-Agent Intelligence - Consensus Building", () => {
  it("should calculate consensus as 'agreed' when threshold met", () => {
    const memory = createMemory({
      multi_agent_context: {
        agreed_by: ["agent_1", "agent_2", "agent_3"],
        disputed_by: []
      }
    });

    const status = calculateConsensus(memory);

    expect(status).toBe("agreed");
  });

  it("should calculate consensus as 'disputed' when threshold met", () => {
    const memory = createMemory({
      multi_agent_context: {
        agreed_by: ["agent_1"],
        disputed_by: ["agent_2", "agent_3"]
      }
    });

    const status = calculateConsensus(memory);

    expect(status).toBe("disputed");
  });

  it("should calculate consensus as 'pending' when no votes yet", () => {
    const memory = createMemory({
      multi_agent_context: {
        agreed_by: [],
        disputed_by: []
      }
    });

    const status = calculateConsensus(memory);

    expect(status).toBe("pending");
  });

  it("should record agent vote on memory", () => {
    const memory = createMemory();

    voteOnMemory(memory, "agent_1", "agree");

    expect(memory.multi_agent_context?.agreed_by).toContain("agent_1");
  });

  it("should move agent from dispute to agree when voting again", () => {
    const memory = createMemory({
      multi_agent_context: {
        agreed_by: [],
        disputed_by: ["agent_1"]
      }
    });

    voteOnMemory(memory, "agent_1", "agree");

    expect(memory.multi_agent_context?.agreed_by).toContain("agent_1");
    expect(memory.multi_agent_context?.disputed_by).not.toContain("agent_1");
  });

  it("should resolve by trust-weighted voting", () => {
    registerAgent(createAgent({ agent_id: "high_trust", trust_level: 0.9 }));
    registerAgent(createAgent({ agent_id: "low_trust", trust_level: 0.3 }));

    const memory = createMemory({
      multi_agent_context: {
        agreed_by: ["high_trust"],
        disputed_by: ["low_trust"]
      }
    });

    const result = resolveByVoting(memory);

    expect(result.resolution).toBe("accepted");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("should mark conflict as resolved", () => {
    const memory = createMemory();

    markResolved(memory, "vote", "resolver_agent");

    expect(memory.multi_agent_context?.consensus_status).toBe("resolved");
    expect(memory.multi_agent_context?.resolution_method).toBe("vote");
    expect(memory.multi_agent_context?.resolver_agent).toBe("resolver_agent");
  });
});

// ============================================================================
// Collaboration Tracking Tests
// ============================================================================

describe("Multi-Agent Intelligence - Collaboration Tracking", () => {
  it("should add contributor to memory", () => {
    const memory = createMemory();
    const agent = createAgent({ agent_id: "contributor_1" });

    addContributor(memory, agent);

    expect(memory.multi_agent_context?.contributors).toHaveLength(1);
    expect(memory.multi_agent_context?.contributors?.[0].agent_id).toBe("contributor_1");
  });

  it("should not add duplicate contributors", () => {
    const memory = createMemory();
    const agent = createAgent({ agent_id: "contributor_2" });

    addContributor(memory, agent);
    addContributor(memory, agent);

    expect(memory.multi_agent_context?.contributors).toHaveLength(1);
  });

  it("should share memory with agent", () => {
    const memory = createMemory();

    shareMemoryWith(memory, "agent_share", "collaboration");

    expect(memory.multi_agent_context?.shared_with).toHaveLength(1);
    expect(memory.multi_agent_context?.shared_with?.[0].agent_id).toBe("agent_share");
    expect(memory.multi_agent_context?.shared_with?.[0].reason).toBe("collaboration");
  });

  it("should grant read access when sharing", () => {
    const memory = createMemory({
      multi_agent_context: {
        acl: createDefaultACL("owner", "private")
      }
    });

    shareMemoryWith(memory, "agent_share_access");

    expect(memory.multi_agent_context?.acl?.read_access).toContain("agent_share_access");
  });

  it("should validate memory and increase crowd confidence", () => {
    registerAgent(createAgent({ agent_id: "validator_1", trust_level: 0.8 }));
    registerAgent(createAgent({ agent_id: "validator_2", trust_level: 0.9 }));

    const memory = createMemory();

    validateMemory(memory, "validator_1");
    validateMemory(memory, "validator_2");

    expect(memory.multi_agent_context?.validators).toHaveLength(2);
    expect(memory.multi_agent_context?.validation_count).toBe(2);
    expect(memory.multi_agent_context?.crowd_confidence).toBeGreaterThan(0.8);
  });
});

// ============================================================================
// SharedSoulManager Tests
// ============================================================================

describe("Multi-Agent Intelligence - SharedSoulManager", () => {
  it("should process memory and detect conflicts", () => {
    const manager = new SharedSoulManager();

    const agent1 = createAgent({ agent_id: "conflict_agent_1" });
    const agent2 = createAgent({ agent_id: "conflict_agent_2" });

    const memory = createMemory({
      id: "mem_manager_1",
      content: "Feature is enabled",
      tags: ["feature", "config"],
      valid_from: "2024-01-01T00:00:00Z",
      multi_agent_context: {
        created_by: agent1
      }
    });

    const conflicting = createMemory({
      id: "mem_manager_2",
      content: "Feature is not enabled",
      tags: ["feature", "config"],
      valid_from: "2024-01-01T00:00:00Z",
      supersedes: "mem_manager_1",
      multi_agent_context: {
        created_by: agent2
      }
    });

    const result = manager.processMemory(conflicting, [memory, conflicting]);

    // Should detect supersedes conflict (different agents)
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("should calculate agent statistics", () => {
    const manager = new SharedSoulManager();
    const agent = createAgent({ agent_id: "stats_agent" });

    const memory1 = createMemory({
      multi_agent_context: {
        created_by: agent,
        agreed_by: ["stats_agent"],
        validators: ["stats_agent"]
      }
    });

    const memory2 = createMemory({
      multi_agent_context: {
        contributors: [agent],
        disputed_by: ["stats_agent"]
      }
    });

    const stats = manager.getAgentStats("stats_agent", [memory1, memory2]);

    expect(stats.memoriesCreated).toBe(1);
    expect(stats.memoriesContributed).toBe(1);
    expect(stats.agreementsGiven).toBe(1);
    expect(stats.disputesRaised).toBe(1);
    expect(stats.validations).toBe(1);
  });

  it("should attempt auto-resolution when enabled", () => {
    const manager = new SharedSoulManager({ auto_resolve: true });

    registerAgent(createAgent({ agent_id: "auto_1", trust_level: 0.9 }));
    registerAgent(createAgent({ agent_id: "auto_2", trust_level: 0.9 }));
    registerAgent(createAgent({ agent_id: "auto_3", trust_level: 0.2 }));

    const memory = createMemory({
      multi_agent_context: {
        agreed_by: ["auto_1", "auto_2"],
        disputed_by: ["auto_3"]
      }
    });

    const resolved = manager.autoResolve(memory);

    expect(resolved).toBe(true);
    expect(memory.multi_agent_context?.consensus_status).toBe("resolved");
  });
});
