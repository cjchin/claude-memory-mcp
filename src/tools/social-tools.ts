/**
 * Social Cognition Tools - v3.0 Phase 4
 *
 * MCP tools for collective intelligence, endorsements, and social proof.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getMemory,
  updateMemory,
  listMemories,
} from "../db.js";
import {
  addEndorsement,
  removeEndorsement,
  getEndorsementsByType,
  getEndorsementCount,
  calculateConsensusLevel,
  calculateControversyScore,
  detectConsensus,
  calculateQualityScore,
  identifyThoughtLeaders,
  identifyDomainExperts,
  calculateTrendingScore,
  isTrending,
  updateSocialMetrics,
  getCollectiveIntelligenceSummary,
  calculateInfluenceScores,
  DEFAULT_SOCIAL_CONFIG,
} from "../social-intelligence.js";
import { config } from "../config.js";
import type { EndorsementType, Memory } from "../types.js";

// ============================================================================
// Helper Functions
// ============================================================================

function formatEndorsement(e: { agent_id: string; type: string; timestamp: string; comment?: string; weight?: number }): string {
  const typeEmojis: Record<string, string> = {
    verified: "✅",
    useful: "👍",
    important: "⭐",
    question: "❓",
    outdated: "📅",
  };

  const emoji = typeEmojis[e.type] || "•";
  const agentDisplay = e.agent_id.length > 15 ? e.agent_id.slice(0, 12) + "..." : e.agent_id;
  const date = new Date(e.timestamp).toLocaleDateString();
  const trustDisplay = e.weight !== undefined ? ` (trust: ${(e.weight * 100).toFixed(0)}%)` : "";

  let output = `  ${emoji} ${e.type.toUpperCase()}`;
  output += ` by ${agentDisplay}`;
  output += trustDisplay;
  output += ` - ${date}`;

  if (e.comment) {
    output += `\n     "${e.comment}"`;
  }

  return output;
}

function formatConsensusStatus(status: string): string {
  const statusEmojis: Record<string, string> = {
    strong_consensus: "✅",
    weak_consensus: "👍",
    controversial: "⚠️",
    insufficient_data: "❓",
  };
  return `${statusEmojis[status] || "•"} ${status}`;
}

function formatMemorySummary(mem: Memory): string {
  const contentPreview = mem.content.slice(0, 80) + (mem.content.length > 80 ? "..." : "");
  return `[${mem.id}] ${mem.type} - ${contentPreview}`;
}

// ============================================================================
// Social Tools Registration
// ============================================================================

export function registerSocialTools(server: McpServer): void {
  // Endorse a memory
  server.tool(
    "endorse_memory",
    {
      memory_id: z.string().describe("Memory ID to endorse"),
      endorsement_type: z
        .enum(["verified", "useful", "important", "question", "outdated"])
        .describe("Type of endorsement"),
      agent_id: z.string().optional().describe("Agent ID (defaults to current agent)"),
      comment: z.string().optional().describe("Optional comment explaining the endorsement"),
      agent_trust: z.number().min(0).max(1).optional().describe("Agent trust level (0-1)"),
    },
    async ({ memory_id, endorsement_type, agent_id, comment, agent_trust }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      const effectiveAgentId = agent_id || config.current_agent_id || "human_user";
      const effectiveTrust = agent_trust ?? 0.5;

      const updated = addEndorsement(
        memory,
        effectiveAgentId,
        endorsement_type as EndorsementType,
        comment,
        effectiveTrust
      );

      await updateMemory(memory_id, {
        social_context: updated.social_context,
      });

      const endorsementCount = getEndorsementCount(updated);
      const summary = updated.social_context?.endorsement_summary;

      let output = `✅ Endorsement added to memory ${memory_id}\n\n`;
      output += `Type: ${endorsement_type}\n`;
      output += `Agent: ${effectiveAgentId}\n`;
      if (comment) {
        output += `Comment: "${comment}"\n`;
      }
      output += `\n📊 Endorsement Summary (${endorsementCount} total):\n`;
      output += `  ✅ Verified: ${summary?.verified || 0}\n`;
      output += `  👍 Useful: ${summary?.useful || 0}\n`;
      output += `  ⭐ Important: ${summary?.important || 0}\n`;
      output += `  ❓ Questioned: ${summary?.questioned || 0}\n`;
      output += `  📅 Outdated: ${summary?.outdated || 0}`;

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Remove endorsement
  server.tool(
    "remove_endorsement",
    {
      memory_id: z.string().describe("Memory ID"),
      agent_id: z.string().optional().describe("Agent ID (defaults to current agent)"),
    },
    async ({ memory_id, agent_id }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      const effectiveAgentId = agent_id || config.current_agent_id || "human_user";
      const updated = removeEndorsement(memory, effectiveAgentId);

      await updateMemory(memory_id, {
        social_context: updated.social_context,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Removed endorsement from ${effectiveAgentId} on memory ${memory_id}`,
          },
        ],
      };
    }
  );

  // Get endorsements for a memory
  server.tool(
    "get_endorsements",
    {
      memory_id: z.string().describe("Memory ID"),
      type: z
        .enum(["verified", "useful", "important", "question", "outdated"])
        .optional()
        .describe("Filter by endorsement type"),
    },
    async ({ memory_id, type }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      const endorsements = type
        ? getEndorsementsByType(memory, type as EndorsementType)
        : memory.social_context?.endorsements || [];

      if (endorsements.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: type
                ? `No ${type} endorsements found for memory ${memory_id}`
                : `No endorsements found for memory ${memory_id}`,
            },
          ],
        };
      }

      let output = `📊 Endorsements for memory ${memory_id}`;
      if (type) {
        output += ` (type: ${type})`;
      }
      output += `:\n\n`;

      output += formatMemorySummary(memory) + "\n\n";
      output += `Total: ${endorsements.length} endorsement(s)\n\n`;

      for (const e of endorsements) {
        output += formatEndorsement(e) + "\n";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Detect consensus on a memory
  server.tool(
    "detect_consensus",
    {
      memory_id: z.string().describe("Memory ID to check consensus on"),
    },
    async ({ memory_id }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      const consensusStatus = detectConsensus(memory);
      const consensusLevel = calculateConsensusLevel(memory);
      const controversyScore = calculateControversyScore(memory);
      const endorsementCount = getEndorsementCount(memory);

      let output = `🔍 Consensus Analysis for memory ${memory_id}\n\n`;
      output += formatMemorySummary(memory) + "\n\n";
      output += `Status: ${formatConsensusStatus(consensusStatus)}\n`;
      output += `Consensus Level: ${(consensusLevel * 100).toFixed(0)}% agreement\n`;
      output += `Controversy Score: ${(controversyScore * 100).toFixed(0)}% disagreement\n`;
      output += `Total Endorsements: ${endorsementCount}\n`;

      if (memory.social_context?.endorsement_summary) {
        const s = memory.social_context.endorsement_summary;
        output += `\n📊 Breakdown:\n`;
        output += `  ✅ Verified: ${s.verified}\n`;
        output += `  👍 Useful: ${s.useful}\n`;
        output += `  ⭐ Important: ${s.important}\n`;
        output += `  ❓ Questioned: ${s.questioned}\n`;
        output += `  📅 Outdated: ${s.outdated}`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Get trending memories
  server.tool(
    "get_trending",
    {
      project: z.string().optional().describe("Filter by project"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Max results"),
    },
    async ({ project, limit }) => {
      const memories = await listMemories({
        limit: 100,
        project: project || config.current_project,
        sortBy: "recent",
      });

      const trending = memories
        .filter((m) => isTrending(m))
        .sort((a, b) => {
          const scoreA = calculateTrendingScore(a);
          const scoreB = calculateTrendingScore(b);
          return scoreB - scoreA;
        })
        .slice(0, limit);

      if (trending.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No trending memories found.",
            },
          ],
        };
      }

      let output = `🔥 Trending Memories (${trending.length}):\n\n`;

      for (const mem of trending) {
        const score = calculateTrendingScore(mem);
        const endorsementCount = getEndorsementCount(mem);

        output += `${formatMemorySummary(mem)}\n`;
        output += `  Trending Score: ${(score * 100).toFixed(0)}%\n`;
        output += `  Endorsements: ${endorsementCount}\n`;
        output += `  Tags: ${mem.tags.join(", ") || "none"}\n\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Get most influential memories
  server.tool(
    "get_influential",
    {
      project: z.string().optional().describe("Filter by project"),
      limit: z.number().min(1).max(50).optional().default(10).describe("Max results"),
    },
    async ({ project, limit }) => {
      const memories = await listMemories({
        limit: 200,
        project: project || config.current_project,
        sortBy: "recent",
      });

      const influenceScores = calculateInfluenceScores(memories);

      const influential = memories
        .map((m) => ({
          memory: m,
          influence: influenceScores.get(m.id) || 0,
        }))
        .sort((a, b) => b.influence - a.influence)
        .slice(0, limit);

      if (influential.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found.",
            },
          ],
        };
      }

      let output = `⭐ Most Influential Memories (${influential.length}):\n\n`;

      for (const { memory: mem, influence } of influential) {
        const citationCount = mem.social_context?.citation_count || 0;
        const qualityScore = calculateQualityScore(mem);

        output += `${formatMemorySummary(mem)}\n`;
        output += `  Influence: ${(influence * 100).toFixed(2)}%\n`;
        output += `  Quality: ${(qualityScore * 100).toFixed(0)}%\n`;
        output += `  Citations: ${citationCount}\n`;
        output += `  Tags: ${mem.tags.join(", ") || "none"}\n\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Get thought leaders
  server.tool(
    "get_thought_leaders",
    {
      project: z.string().optional().describe("Filter by project"),
      limit: z.number().min(1).max(50).optional().default(20).describe("Max memories to analyze"),
    },
    async ({ project, limit }) => {
      const memories = await listMemories({
        limit,
        project: project || config.current_project,
        sortBy: "recent",
      });

      // Collect all thought leaders and their contributions
      const leaderStats = new Map<string, { memories: string[]; endorsements: number }>();

      for (const mem of memories) {
        const leaders = identifyThoughtLeaders(mem);
        for (const leader of leaders) {
          const stats = leaderStats.get(leader) || { memories: [], endorsements: 0 };
          stats.memories.push(mem.id);
          stats.endorsements += getEndorsementsByType(mem, "verified").filter((e) => e.agent_id === leader).length;
          stats.endorsements += getEndorsementsByType(mem, "important").filter((e) => e.agent_id === leader).length;
          leaderStats.set(leader, stats);
        }
      }

      if (leaderStats.size === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No thought leaders identified (need 5+ important/verified endorsements per agent).",
            },
          ],
        };
      }

      let output = `👑 Thought Leaders (${leaderStats.size}):\n\n`;

      const sortedLeaders = Array.from(leaderStats.entries())
        .sort((a, b) => b[1].endorsements - a[1].endorsements);

      for (const [agentId, stats] of sortedLeaders) {
        output += `  🤖 ${agentId}\n`;
        output += `     Memories influenced: ${stats.memories.length}\n`;
        output += `     Endorsements given: ${stats.endorsements}\n\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Update social metrics for a memory
  server.tool(
    "update_social_metrics",
    {
      memory_id: z.string().describe("Memory ID to update metrics for"),
    },
    async ({ memory_id }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      // Get all memories for influence calculation
      const allMemories = await listMemories({
        limit: 200,
        project: memory.project || config.current_project,
      });

      const updated = updateSocialMetrics(memory, allMemories);

      await updateMemory(memory_id, {
        social_context: updated.social_context,
      });

      const social = updated.social_context!;

      let output = `✅ Updated social metrics for memory ${memory_id}\n\n`;
      output += formatMemorySummary(updated) + "\n\n";
      output += `📊 Social Intelligence Metrics:\n`;
      output += `  Consensus: ${((social.consensus_level || 0) * 100).toFixed(0)}%\n`;
      output += `  Quality: ${((social.quality_score || 0) * 100).toFixed(0)}%\n`;
      output += `  Influence: ${((social.influence_score || 0) * 100).toFixed(2)}%\n`;
      output += `  Trending: ${((social.trending_score || 0) * 100).toFixed(0)}%\n`;
      output += `  Stability: ${((social.stability_score || 0) * 100).toFixed(0)}%\n`;
      output += `  Controversy: ${((social.controversy_score || 0) * 100).toFixed(0)}%\n\n`;

      if (social.thought_leaders && social.thought_leaders.length > 0) {
        output += `👑 Thought Leaders: ${social.thought_leaders.join(", ")}\n`;
      }
      if (social.domain_experts && social.domain_experts.length > 0) {
        output += `🎓 Domain Experts: ${social.domain_experts.join(", ")}\n`;
      }

      output += `\n⏰ Last Updated: ${social.last_social_update}`;

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Get collective intelligence summary
  server.tool(
    "collective_intelligence",
    {
      project: z.string().optional().describe("Filter by project"),
      limit: z.number().min(10).max(500).optional().default(100).describe("Number of memories to analyze"),
    },
    async ({ project, limit }) => {
      const memories = await listMemories({
        limit,
        project: project || config.current_project,
        sortBy: "recent",
      });

      if (memories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No memories found.",
            },
          ],
        };
      }

      const summary = getCollectiveIntelligenceSummary(memories);

      let output = `🧠 Collective Intelligence Summary\n`;
      output += `${"=".repeat(60)}\n\n`;
      output += `📊 Overview:\n`;
      output += `  Total Memories: ${summary.total_memories}\n`;
      output += `  Total Endorsements: ${summary.total_endorsements}\n`;
      output += `  Average Quality: ${(summary.average_quality * 100).toFixed(0)}%\n\n`;

      output += `🎯 Consensus:\n`;
      output += `  Strong Consensus: ${summary.high_consensus_count} memories\n`;
      output += `  Controversial: ${summary.controversial_count} memories\n`;
      output += `  Trending: ${summary.trending_count} memories\n\n`;

      if (summary.top_influencers.length > 0) {
        output += `⭐ Most Influential Memories (Top 5):\n`;
        for (const { memory_id, influence } of summary.top_influencers.slice(0, 5)) {
          output += `  • ${memory_id}: ${(influence * 100).toFixed(2)}%\n`;
        }
        output += "\n";
      }

      if (summary.thought_leaders.size > 0) {
        output += `👑 Top Thought Leaders:\n`;
        const sortedLeaders = Array.from(summary.thought_leaders.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        for (const [agentId, count] of sortedLeaders) {
          output += `  • ${agentId}: ${count} memories influenced\n`;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );

  // Get domain experts for a memory
  server.tool(
    "get_domain_experts",
    {
      memory_id: z.string().describe("Memory ID to find experts for"),
    },
    async ({ memory_id }) => {
      const memory = await getMemory(memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory ${memory_id} not found.`,
            },
          ],
        };
      }

      const experts = identifyDomainExperts(memory);

      if (experts.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No domain experts found for memory ${memory_id}\n\n` +
                    `(Domain experts require: verified endorsement + trust >= 80%)`,
            },
          ],
        };
      }

      let output = `🎓 Domain Experts for memory ${memory_id}:\n\n`;
      output += formatMemorySummary(memory) + "\n\n";

      for (const expertId of experts) {
        const endorsements = getEndorsementsByType(memory, "verified")
          .filter((e) => e.agent_id === expertId);

        if (endorsements.length > 0) {
          const e = endorsements[0];
          output += `  🎓 ${expertId}\n`;
          output += `     Trust: ${((e.weight || 0) * 100).toFixed(0)}%\n`;
          if (e.comment) {
            output += `     Comment: "${e.comment}"\n`;
          }
          output += "\n";
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: output,
          },
        ],
      };
    }
  );
}
