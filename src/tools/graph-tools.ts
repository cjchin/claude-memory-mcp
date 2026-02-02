/**
 * Graph Analysis & Linking Tools
 *
 * Memory graph topology and relationship management:
 * - graph_analysis: View clusters, highways, and orphans
 * - propose_links: Generate link proposals from embeddings
 * - apply_link: Create a link between two memories
 * - get_memory_links: View all links for a memory
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getMemory,
  listMemories,
  getAllMemoriesWithEmbeddings,
  addMemoryLink,
  getMemoryLinks,
} from "../db.js";
import type { Memory } from "../types.js";
import {
  analyzeGraphEnrichment,
  generateProposedLinks,
} from "../graph-enrichment.js";

function getReverseLinkType(linkType: string): string {
  const reverseMap: Record<string, string> = {
    "supports": "supported_by",
    "contradicts": "contradicts",
    "extends": "extended_by",
    "supersedes": "superseded_by",
    "depends_on": "depended_on_by",
    "caused_by": "causes",
    "implements": "implemented_by",
    "example_of": "has_example",
    "related": "related",
  };
  return reverseMap[linkType] || "related";
}

export function registerGraphTools(server: McpServer): void {
  server.tool(
    "graph_analysis",
    {
      project: z.string().optional().describe("Limit to this project"),
      min_similarity: z.number().min(0.3).max(0.95).optional().default(0.5)
        .describe("Minimum similarity threshold for connections"),
      max_display: z.number().optional().default(15)
        .describe("Max items to display per category"),
    },
    async ({ project, min_similarity, max_display }) => {
      const memories = await getAllMemoriesWithEmbeddings();
      const filtered = project ? memories.filter(m => m.project === project) : memories;

      if (filtered.length < 2) {
        return { content: [{ type: "text" as const, text: "Need at least 2 memories for graph analysis." }] };
      }

      const analysis = analyzeGraphEnrichment(filtered, { minSimilarity: min_similarity, maxLinksPerMemory: 5 });

      const sections: string[] = [];
      sections.push(`🕸️ GRAPH ANALYSIS\n${"═".repeat(50)}\n`);
      sections.push(`Total memories: ${analysis.totalMemories}`);
      sections.push(`Clusters found: ${analysis.clustersFound}`);
      sections.push(`Highways identified: ${analysis.highwaysIdentified}`);
      sections.push(`Links proposed: ${analysis.linksProposed}`);
      sections.push(`Cross-cluster bridges: ${analysis.crossClusterLinks}`);

      if (analysis.clusters.size > 0) {
        sections.push(`\n📦 CLUSTERS (${analysis.clustersFound}):`);
        let clusterNum = 0;
        for (const [clusterId, memberIds] of analysis.clusters) {
          if (clusterNum >= max_display) {
            sections.push(`  ... and ${analysis.clusters.size - clusterNum} more clusters`);
            break;
          }
          const members = memberIds.slice(0, 3).map(id => {
            const mem = filtered.find(m => m.id === id);
            return mem ? `"${mem.content.slice(0, 40)}..."` : id;
          });
          sections.push(`  Cluster ${clusterId}: ${memberIds.length} memories`);
          sections.push(`    ${members.join(", ")}${memberIds.length > 3 ? ` +${memberIds.length - 3} more` : ""}`);
          clusterNum++;
        }
      }

      if (analysis.highways.length > 0) {
        sections.push(`\n🛣️ HIGHWAYS (high-centrality memories):`);
        for (const hwId of analysis.highways.slice(0, max_display)) {
          const mem = filtered.find(m => m.id === hwId);
          if (mem) {
            sections.push(`  • [${mem.type}] "${mem.content.slice(0, 60)}..."`);
          }
        }
      }

      const orphans = filtered.filter(m => !m.related_memories?.length);
      if (orphans.length > 0) {
        sections.push(`\n🏝️ ORPHANS (no links): ${orphans.length}`);
        for (const orphan of orphans.slice(0, Math.min(5, max_display))) {
          sections.push(`  • [${orphan.id.slice(0, 12)}...] "${orphan.content.slice(0, 50)}..."`);
        }
        if (orphans.length > 5) {
          sections.push(`  ... and ${orphans.length - 5} more`);
        }
      }

      sections.push(`\n💡 Use propose_links to generate link suggestions.`);

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );

  server.tool(
    "propose_links",
    {
      limit: z.number().optional().default(20).describe("Max proposals to generate"),
      min_similarity: z.number().min(0.5).max(0.95).optional().default(0.6)
        .describe("Minimum similarity for link proposals"),
      project: z.string().optional().describe("Limit to this project"),
      prioritize_cross_cluster: z.boolean().optional().default(true)
        .describe("Prioritize links that bridge clusters"),
      prioritize_highways: z.boolean().optional().default(true)
        .describe("Prioritize connections to high-centrality nodes"),
    },
    async ({ limit, min_similarity, project, prioritize_cross_cluster, prioritize_highways }) => {
      const memories = await getAllMemoriesWithEmbeddings();
      const filtered = project ? memories.filter(m => m.project === project) : memories;

      if (filtered.length < 2) {
        return { content: [{ type: "text" as const, text: "Need at least 2 memories for link proposals." }] };
      }

      const proposals = generateProposedLinks(filtered, {
        minSimilarity: min_similarity,
        maxLinksPerMemory: 5,
        prioritizeCrossCluster: prioritize_cross_cluster,
        prioritizeHighways: prioritize_highways,
      });

      if (proposals.length === 0) {
        return { content: [{ type: "text" as const, text: `No link proposals at ${(min_similarity * 100).toFixed(0)}% similarity threshold.` }] };
      }

      const sections: string[] = [];
      sections.push(`🔗 LINK PROPOSALS (${Math.min(proposals.length, limit)} of ${proposals.length})\n`);

      for (let i = 0; i < Math.min(proposals.length, limit); i++) {
        const p = proposals[i];
        const source = filtered.find(m => m.id === p.sourceId);
        const target = filtered.find(m => m.id === p.targetId);

        const flags: string[] = [];
        if (p.isCrossCluster) flags.push("🌉 cross-cluster");
        if (p.isHighwayConnection) flags.push("🛣️ highway");

        sections.push(`${i + 1}. ${p.type.toUpperCase()} (${(p.similarity * 100).toFixed(0)}% similar)${flags.length ? " " + flags.join(" ") : ""}`);
        sections.push(`   Source: "${source?.content.slice(0, 50)}..."`);
        sections.push(`   Target: "${target?.content.slice(0, 50)}..."`);
        sections.push(`   Reason: ${p.reason}`);
        sections.push(`   → apply_link({ source_id: "${p.sourceId}", target_id: "${p.targetId}", link_type: "${p.type}" })`);
        sections.push("");
      }

      return { content: [{ type: "text" as const, text: sections.join("\n") }] };
    }
  );

  server.tool(
    "apply_link",
    {
      source_id: z.string().describe("Source memory ID"),
      target_id: z.string().describe("Target memory ID"),
      link_type: z.enum([
        "related", "supports", "contradicts", "extends",
        "supersedes", "depends_on", "caused_by", "implements", "example_of"
      ]).describe("Type of relationship"),
      reason: z.string().optional().describe("Why these are linked"),
      strength: z.number().min(0).max(1).optional().default(0.8)
        .describe("Link strength 0-1"),
      bidirectional: z.boolean().optional().default(true)
        .describe("Create reverse link too"),
    },
    async ({ source_id, target_id, link_type, reason, strength, bidirectional }) => {
      try {
        const source = await getMemory(source_id);
        const target = await getMemory(target_id);

        if (!source) {
          return { content: [{ type: "text" as const, text: `❌ Source memory not found: ${source_id}` }] };
        }
        if (!target) {
          return { content: [{ type: "text" as const, text: `❌ Target memory not found: ${target_id}` }] };
        }

        await addMemoryLink(source_id, {
          targetId: target_id,
          type: link_type,
          reason: reason || `${link_type} relationship`,
          strength,
          createdBy: "conscious",
        });

        let resultText = `✅ Created link: ${source_id.slice(0, 12)}... --[${link_type}]--> ${target_id.slice(0, 12)}...`;

        if (bidirectional) {
          const reverseType = getReverseLinkType(link_type);
          await addMemoryLink(target_id, {
            targetId: source_id,
            type: reverseType,
            reason: reason || `${reverseType} relationship (reverse)`,
            strength,
            createdBy: "conscious",
          });
          resultText += `\n✅ Created reverse: ${target_id.slice(0, 12)}... --[${reverseType}]--> ${source_id.slice(0, 12)}...`;
        }

        return { content: [{ type: "text" as const, text: resultText }] };
      } catch (error) {
        console.error("Error creating memory link:", error);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Failed to create link: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );

  server.tool(
    "get_memory_links",
    {
      memory_id: z.string().describe("Memory ID to get links for"),
      direction: z.enum(["outgoing", "incoming", "both"]).optional().default("both")
        .describe("Which direction of links to show"),
    },
    async ({ memory_id, direction }) => {
      try {
        const memory = await getMemory(memory_id);
        if (!memory) {
          return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
        }

        const sections: string[] = [];
        sections.push(`🔗 LINKS FOR: "${memory.content.slice(0, 60)}..."\n`);

      if (direction === "outgoing" || direction === "both") {
        const outgoing = await getMemoryLinks(memory_id);
        sections.push(`📤 OUTGOING (${outgoing.length}):`);
        if (outgoing.length === 0) {
          sections.push("   None");
        } else {
          for (const link of outgoing) {
            const target = await getMemory(link.targetId);
            sections.push(`   --[${link.type}]--> "${target?.content.slice(0, 40) || link.targetId}..."`);
            if (link.reason) sections.push(`      Reason: ${link.reason}`);
          }
        }
      }

      if (direction === "incoming" || direction === "both") {
        const allMemories = await listMemories({ limit: 1000 });
        const incoming: Array<{ from: Memory; link: any }> = [];

        for (const m of allMemories) {
          const links = await getMemoryLinks(m.id);
          for (const link of links) {
            if (link.targetId === memory_id) {
              incoming.push({ from: m, link });
            }
          }
          if (m.related_memories?.includes(memory_id) && !links.some((l: any) => l.targetId === memory_id)) {
            incoming.push({ from: m, link: { type: "related", targetId: memory_id } });
          }
        }

        sections.push(`\n📥 INCOMING (${incoming.length}):`);
        if (incoming.length === 0) {
          sections.push("   None");
        } else {
          for (const { from, link } of incoming.slice(0, 20)) {
            sections.push(`   "${from.content.slice(0, 40)}..." --[${link.type}]-->`);
          }
          if (incoming.length > 20) {
            sections.push(`   ... and ${incoming.length - 20} more`);
          }
        }
      }

        return { content: [{ type: "text" as const, text: sections.join("\n") }] };
      } catch (error) {
        console.error("Error getting memory links:", error);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Failed to get links: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    }
  );
}
