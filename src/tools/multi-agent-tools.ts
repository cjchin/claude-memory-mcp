/**
 * Multi-Agent Intelligence MCP Tools - v3.0 Phase 3
 *
 * MCP tools for multi-agent collaboration, consensus building, and conflict resolution.
 * Enables multiple agents to work together in a shared soul system.
 *
 * Tools provided:
 * 1. register_agent - Register a new agent in the system
 * 2. list_agents - View all registered agents
 * 3. agent_stats - View statistics for an agent
 * 4. vote_on_memory - Vote to agree or dispute a memory
 * 5. detect_conflicts - Find conflicts in memories
 * 6. resolve_conflict - Resolve a disagreement between agents
 * 7. share_memory - Share a memory with another agent
 * 8. validate_memory - Validate a memory to build crowd confidence
 * 9. agent_consensus - Check consensus status for memories
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMemory, listMemories, updateMemory } from "../db.js";
import {
  registerAgent,
  listAgents,
  getAgent,
  voteOnMemory,
  findConflicts,
  resolveByVoting,
  markResolved,
  shareMemoryWith,
  validateMemory,
  calculateConsensus,
  SharedSoulManager,
  createDefaultACL,
  canRead,
  canWrite
} from "../multi-agent.js";
import type { AgentType, Memory } from "../types.js";
import { config } from "../config.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format agent for display
 */
function formatAgent(agent: any, detailed: boolean = false): string {
  const typeEmojis: Record<AgentType, string> = {
    claude: "🤖",
    human: "👤",
    walker: "🚶",
    custom: "⚙️"
  };

  let output = `${typeEmojis[agent.agent_type as AgentType]} ${agent.agent_name || agent.agent_id}`;
  output += ` (${agent.agent_type})`;

  if (detailed) {
    output += `\n  ID: ${agent.agent_id}`;
    output += `\n  Trust: ${((agent.trust_level || 0) * 100).toFixed(0)}%`;

    if (agent.capabilities?.length) {
      output += `\n  Capabilities: ${agent.capabilities.join(", ")}`;
    }

    if (agent.last_active) {
      const lastActive = new Date(agent.last_active);
      const now = new Date();
      const hoursSince = Math.round((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60));
      output += `\n  Last active: ${hoursSince}h ago`;
    }
  }

  return output;
}

/**
 * Format consensus status with emoji
 */
function formatConsensusStatus(status: string): string {
  const statusEmojis: Record<string, string> = {
    agreed: "✅",
    disputed: "⚠️",
    pending: "⏳",
    resolved: "🔒"
  };

  return `${statusEmojis[status] || "❓"} ${status}`;
}

// ============================================================================
// MCP Tool Registration
// ============================================================================

export function registerMultiAgentTools(server: McpServer): void {
  /**
   * Tool 1: register_agent
   *
   * Register a new agent in the shared soul system
   */
  server.tool(
    "register_agent",
    {
      agent_id: z.string().describe("Unique agent identifier"),
      agent_name: z.string().optional().describe("Human-readable name"),
      agent_type: z.enum(["claude", "human", "walker", "custom"]).describe("Type of agent"),
      trust_level: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Initial trust level (0-1, default: 0.5)"),
      capabilities: z
        .array(z.string())
        .optional()
        .describe("Agent capabilities (e.g., ['read', 'write', 'resolve'])")
    },
    async ({ agent_id, agent_name, agent_type, trust_level, capabilities }) => {
      const agent = registerAgent({
        agent_id,
        agent_name,
        agent_type: agent_type as AgentType,
        trust_level,
        capabilities
      });

      let output = `🎉 Agent registered successfully!\n\n`;
      output += formatAgent(agent, true);

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 2: list_agents
   *
   * List all registered agents
   */
  server.tool(
    "list_agents",
    {
      sort_by: z
        .enum(["trust", "activity", "created"])
        .optional()
        .default("activity")
        .describe("Sort agents by field")
    },
    async ({ sort_by }) => {
      const agents = listAgents();

      if (agents.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No agents registered yet."
            }
          ]
        };
      }

      // Sort agents
      const sorted = [...agents].sort((a, b) => {
        if (sort_by === "trust") {
          return (b.trust_level || 0) - (a.trust_level || 0);
        } else if (sort_by === "activity") {
          const aTime = new Date(a.last_active || 0).getTime();
          const bTime = new Date(b.last_active || 0).getTime();
          return bTime - aTime;
        } else {
          // created
          const aTime = new Date(a.created_at || 0).getTime();
          const bTime = new Date(b.created_at || 0).getTime();
          return bTime - aTime;
        }
      });

      let output = `🤝 REGISTERED AGENTS (${sorted.length})\n\n`;
      output += sorted.map((agent, i) => `${i + 1}. ${formatAgent(agent, true)}`).join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 3: agent_stats
   *
   * View statistics for an agent
   */
  server.tool(
    "agent_stats",
    {
      agent_id: z.string().describe("Agent ID to get stats for"),
      project: z.string().optional().describe("Filter by project")
    },
    async ({ agent_id, project }) => {
      const agent = getAgent(agent_id);

      if (!agent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent ${agent_id} not found.`
            }
          ]
        };
      }

      // Get all memories for project
      const memories = await listMemories({
        limit: 1000,
        project: project || config.current_project
      });

      // Calculate stats
      const manager = new SharedSoulManager();
      const stats = manager.getAgentStats(agent_id, memories);

      let output = `📊 AGENT STATISTICS\n\n`;
      output += formatAgent(agent, true);
      output += `\n\n`;
      output += `Activity:\n`;
      output += `  • Memories created: ${stats.memoriesCreated}\n`;
      output += `  • Memories contributed to: ${stats.memoriesContributed}\n`;
      output += `  • Agreements given: ${stats.agreementsGiven}\n`;
      output += `  • Disputes raised: ${stats.disputesRaised}\n`;
      output += `  • Validations: ${stats.validations}\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 4: vote_on_memory
   *
   * Vote to agree or dispute a memory
   */
  server.tool(
    "vote_on_memory",
    {
      memory_id: z.string().describe("Memory ID to vote on"),
      agent_id: z.string().describe("Your agent ID"),
      vote: z.enum(["agree", "dispute"]).describe("Your vote"),
      reason: z.string().optional().describe("Reason for dispute (required if voting dispute)")
    },
    async ({ memory_id, agent_id, vote, reason }) => {
      const memory = await getMemory(memory_id);

      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      // Check if agent is registered
      const agent = getAgent(agent_id);
      if (!agent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent ${agent_id} not registered. Use register_agent first.`
            }
          ]
        };
      }

      // Record vote
      voteOnMemory(memory, agent_id, vote, reason);

      // Update memory
      await updateMemory(memory_id, {
        ...memory
      });

      const mac = memory.multi_agent_context!;
      const status = mac.consensus_status;

      let output = `${vote === "agree" ? "✅" : "⚠️"} Vote recorded!\n\n`;
      output += `Memory: ${memory.content.slice(0, 100)}...\n\n`;
      output += `Votes:\n`;
      output += `  ✅ Agree: ${mac.agreed_by?.length || 0}\n`;
      output += `  ⚠️ Dispute: ${mac.disputed_by?.length || 0}\n\n`;
      output += `Status: ${formatConsensusStatus(status!)}\n`;

      if (reason && vote === "dispute") {
        output += `\nDispute reason: ${reason}`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 5: detect_conflicts
   *
   * Find conflicts in memories
   */
  server.tool(
    "detect_conflicts",
    {
      memory_id: z.string().optional().describe("Check conflicts for specific memory"),
      project: z.string().optional().describe("Filter by project"),
      min_confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.6)
        .describe("Minimum conflict confidence"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum conflicts to show")
    },
    async ({ memory_id, project, min_confidence, limit }) => {
      const memories = await listMemories({
        limit: 100,
        project: project || config.current_project
      });

      if (memory_id) {
        // Check conflicts for specific memory
        const memory = await getMemory(memory_id);

        if (!memory) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Memory ${memory_id} not found.`
              }
            ]
          };
        }

        const conflicts = findConflicts(memory, memories, min_confidence);

        if (conflicts.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No conflicts found for memory ${memory_id}.`
              }
            ]
          };
        }

        let output = `⚠️ CONFLICTS FOUND (${conflicts.length})\n\n`;
        output += `Source memory: ${memory.content.slice(0, 100)}...\n\n`;

        conflicts.slice(0, limit).forEach((conflict, i) => {
          output += `${i + 1}. ${conflict.conflict.conflictType?.toUpperCase()} conflict (${(conflict.conflict.confidence * 100).toFixed(0)}%)\n`;
          output += `   ${conflict.memory.content.slice(0, 80)}...\n`;
          if (conflict.conflict.reason) {
            output += `   Reason: ${conflict.conflict.reason}\n`;
          }
          output += `\n`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: output
            }
          ]
        };
      } else {
        // Check all memories for conflicts
        let totalConflicts = 0;
        const conflictPairs: Array<{
          memory: Memory;
          conflicts: ReturnType<typeof findConflicts>;
        }> = [];

        for (const memory of memories) {
          const conflicts = findConflicts(memory, memories, min_confidence);
          if (conflicts.length > 0) {
            conflictPairs.push({ memory, conflicts });
            totalConflicts += conflicts.length;
          }
        }

        if (totalConflicts === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No conflicts detected in memories."
              }
            ]
          };
        }

        let output = `⚠️ CONFLICTS DETECTED (${totalConflicts} total)\n\n`;

        conflictPairs.slice(0, limit).forEach((pair, i) => {
          output += `${i + 1}. Memory: ${pair.memory.content.slice(0, 60)}...\n`;
          output += `   Conflicts with ${pair.conflicts.length} ${pair.conflicts.length === 1 ? "memory" : "memories"}\n\n`;
        });

        if (conflictPairs.length > limit) {
          output += `... and ${conflictPairs.length - limit} more\n`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: output
            }
          ]
        };
      }
    }
  );

  /**
   * Tool 6: resolve_conflict
   *
   * Resolve a conflict between memories
   */
  server.tool(
    "resolve_conflict",
    {
      memory_id: z.string().describe("Memory ID to resolve"),
      method: z
        .enum(["vote", "synthesize", "defer_expert", "accept_both"])
        .describe("Resolution method"),
      resolver_agent_id: z.string().describe("Agent ID performing resolution"),
      synthesized_content: z
        .string()
        .optional()
        .describe("New synthesized content (required for 'synthesize' method)")
    },
    async ({ memory_id, method, resolver_agent_id, synthesized_content }) => {
      const memory = await getMemory(memory_id);

      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      const agent = getAgent(resolver_agent_id);
      if (!agent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent ${resolver_agent_id} not registered.`
            }
          ]
        };
      }

      let output = `🔒 CONFLICT RESOLUTION\n\n`;
      output += `Memory: ${memory.content.slice(0, 100)}...\n`;
      output += `Method: ${method}\n\n`;

      if (method === "vote") {
        const result = resolveByVoting(memory);
        output += `Voting result: ${result.resolution} (confidence: ${(result.confidence * 100).toFixed(0)}%)\n`;
        markResolved(memory, "vote", resolver_agent_id);
      } else if (method === "synthesize") {
        if (!synthesized_content) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: synthesized_content required for 'synthesize' method"
              }
            ]
          };
        }

        memory.content = synthesized_content;
        markResolved(memory, "synthesize", resolver_agent_id);
        output += `New synthesized content:\n"${synthesized_content}"\n`;
      } else {
        markResolved(memory, method, resolver_agent_id);
        output += `Conflict marked as resolved using ${method} strategy.\n`;
      }

      // Update memory
      await updateMemory(memory_id, {
        ...memory
      });

      output += `\n✅ Conflict resolved by ${agent.agent_name || resolver_agent_id}`;

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 7: share_memory
   *
   * Share a memory with another agent
   */
  server.tool(
    "share_memory",
    {
      memory_id: z.string().describe("Memory ID to share"),
      target_agent_id: z.string().describe("Agent ID to share with"),
      reason: z.string().optional().describe("Reason for sharing")
    },
    async ({ memory_id, target_agent_id, reason }) => {
      const memory = await getMemory(memory_id);

      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      const targetAgent = getAgent(target_agent_id);
      if (!targetAgent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent ${target_agent_id} not registered.`
            }
          ]
        };
      }

      shareMemoryWith(memory, target_agent_id, reason);

      // Update memory
      await updateMemory(memory_id, {
        ...memory
      });

      let output = `📤 Memory shared successfully!\n\n`;
      output += `With: ${formatAgent(targetAgent)}\n`;
      output += `Memory: ${memory.content.slice(0, 100)}...\n`;
      if (reason) {
        output += `Reason: ${reason}\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 8: validate_memory
   *
   * Validate a memory to build crowd confidence
   */
  server.tool(
    "validate_memory",
    {
      memory_id: z.string().describe("Memory ID to validate"),
      validator_agent_id: z.string().describe("Agent ID performing validation")
    },
    async ({ memory_id, validator_agent_id }) => {
      const memory = await getMemory(memory_id);

      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`
            }
          ]
        };
      }

      const agent = getAgent(validator_agent_id);
      if (!agent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent ${validator_agent_id} not registered.`
            }
          ]
        };
      }

      validateMemory(memory, validator_agent_id);

      // Update memory
      await updateMemory(memory_id, {
        ...memory
      });

      const mac = memory.multi_agent_context!;

      let output = `✅ Memory validated!\n\n`;
      output += `Validator: ${formatAgent(agent)}\n`;
      output += `Memory: ${memory.content.slice(0, 100)}...\n\n`;
      output += `Validation count: ${mac.validation_count || 0}\n`;
      output += `Crowd confidence: ${((mac.crowd_confidence || 0) * 100).toFixed(0)}%\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );

  /**
   * Tool 9: agent_consensus
   *
   * Check consensus status for memories
   */
  server.tool(
    "agent_consensus",
    {
      project: z.string().optional().describe("Filter by project"),
      status: z
        .enum(["agreed", "disputed", "pending", "resolved"])
        .optional()
        .describe("Filter by consensus status"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Maximum memories to show")
    },
    async ({ project, status, limit }) => {
      const memories = await listMemories({
        limit: 100,
        project: project || config.current_project
      });

      // Filter memories with multi-agent context
      let multiAgentMemories = memories.filter(m => m.multi_agent_context !== undefined);

      // Filter by status if specified
      if (status) {
        multiAgentMemories = multiAgentMemories.filter(
          m => m.multi_agent_context?.consensus_status === status
        );
      }

      if (multiAgentMemories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: status
                ? `No memories with consensus status: ${status}`
                : "No memories with multi-agent context found."
            }
          ]
        };
      }

      // Calculate statistics
      const stats = {
        agreed: 0,
        disputed: 0,
        pending: 0,
        resolved: 0
      };

      for (const mem of multiAgentMemories) {
        const s = mem.multi_agent_context?.consensus_status || "pending";
        stats[s as keyof typeof stats]++;
      }

      let output = `🤝 AGENT CONSENSUS STATUS\n\n`;
      output += `Total memories with multi-agent context: ${multiAgentMemories.length}\n\n`;
      output += `Distribution:\n`;
      output += `  ${formatConsensusStatus("agreed")} Agreed: ${stats.agreed}\n`;
      output += `  ${formatConsensusStatus("disputed")} Disputed: ${stats.disputed}\n`;
      output += `  ${formatConsensusStatus("pending")} Pending: ${stats.pending}\n`;
      output += `  ${formatConsensusStatus("resolved")} Resolved: ${stats.resolved}\n\n`;

      if (status) {
        output += `Showing ${status} memories:\n\n`;
      }

      multiAgentMemories.slice(0, limit).forEach((mem, i) => {
        const mac = mem.multi_agent_context!;
        const s = mac.consensus_status || "pending";

        output += `${i + 1}. ${formatConsensusStatus(s)}\n`;
        output += `   ${mem.content.slice(0, 80)}...\n`;
        output += `   Votes: ${mac.agreed_by?.length || 0} agree, ${mac.disputed_by?.length || 0} dispute\n`;

        if (mac.created_by) {
          output += `   Created by: ${mac.created_by.agent_name || mac.created_by.agent_id}\n`;
        }

        output += `\n`;
      });

      if (multiAgentMemories.length > limit) {
        output += `... and ${multiAgentMemories.length - limit} more\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output
          }
        ]
      };
    }
  );
}
