# Soul-MCP Missing Tools Implementation Prompt

## Context

You are implementing additional MCP tools for a cognitive infrastructure system called soul-mcp. The codebase is at `C:\DEV\RAG-Context` (or the current working directory).

**Current state:**
- 235 memories in ChromaDB
- Core tools working: remember, recall, find_similar, merge_memories, prime, etc.
- Dream cycle tools added: run_dream, review_contradiction, resolve_contradiction, review_consolidation, apply_consolidation
- LLM integration added: configure_llm, llm_status
- Backend modules exist but are NOT exposed as MCP tools: graph-enrichment.ts, policy.ts

**Your task:** Add the missing MCP tools to `src/index.ts` to expose existing backend functionality.

---

## Files to Reference

Before implementing, read these files to understand the existing patterns and available functions:

1. `src/index.ts` - See existing tool patterns (use same style)
2. `src/graph-enrichment.ts` - Has `analyzeGraphEnrichment()`, `generateProposedLinks()`, `proposedLinkToMemoryLink()`
3. `src/policy.ts` - Has `PolicyEngine`, `createPersistentPolicyEngine()`, `savePolicyEngine()`, `createProposal()`, `ACTION_METADATA`, `WALKER_CAPABILITIES`
4. `src/db.ts` - Has `addMemoryLink()`, `getAllMemoriesWithEmbeddings()`, `updateMemory()`, `getMemory()`
5. `src/types.ts` - Has `LinkType`, `MemoryLink`, `Memory` types

---

## Tools to Implement

### 1. `graph_analysis` - View memory graph topology

**Purpose:** Analyze clusters, highways (central nodes), orphans (unlinked memories), and link opportunities.

**Implementation:**
```typescript
import {
  analyzeGraphEnrichment,
  generateProposedLinks,
  proposedLinkToMemoryLink,
  type ProposedLink,
  type EnrichmentResult,
} from "./graph-enrichment.js";

server.tool(
  "graph_analysis",
  {
    project: z.string().optional().describe("Limit to this project"),
    min_similarity: z.number().min(0.3).max(0.95).optional().default(0.5),
    max_display: z.number().optional().default(15),
  },
  async ({ project, min_similarity, max_display }) => {
    const memories = await getAllMemoriesWithEmbeddings();
    const filtered = project ? memories.filter(m => m.project === project) : memories;
    
    if (filtered.length < 2) {
      return { content: [{ type: "text" as const, text: "Need at least 2 memories for analysis." }] };
    }
    
    const analysis = analyzeGraphEnrichment(filtered, { minSimilarity: min_similarity, maxLinksPerMemory: 5 });
    
    const sections: string[] = [];
    sections.push(`🕸️ GRAPH ANALYSIS\n${"═".repeat(50)}\n`);
    sections.push(`Total memories: ${analysis.totalMemories}`);
    sections.push(`Clusters found: ${analysis.clustersFound}`);
    sections.push(`Highways identified: ${analysis.highwaysIdentified}`);
    sections.push(`Links proposed: ${analysis.linksProposed}`);
    sections.push(`Cross-cluster bridges: ${analysis.crossClusterLinks}`);
    
    // Show clusters
    if (analysis.clusters.size > 0) {
      sections.push(`\n📦 CLUSTERS (${analysis.clustersFound}):`);
      let clusterNum = 0;
      for (const [clusterId, memberIds] of analysis.clusters) {
        if (clusterNum >= max_display) {
          sections.push(`  ... and ${analysis.clusters.size - max_display} more clusters`);
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
    
    // Show highways
    if (analysis.highways.length > 0) {
      sections.push(`\n🛣️ HIGHWAYS (high-centrality memories):`);
      for (const hwId of analysis.highways.slice(0, max_display)) {
        const mem = filtered.find(m => m.id === hwId);
        if (mem) {
          sections.push(`  • [${mem.type}] "${mem.content.slice(0, 60)}..."`);
        }
      }
    }
    
    // Show orphans (memories with no related_memories)
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
```

---

### 2. `propose_links` - Generate link proposals from graph analysis

**Purpose:** Analyze memory embeddings and propose semantic links between related memories.

```typescript
server.tool(
  "propose_links",
  {
    limit: z.number().optional().default(20).describe("Max proposals to generate"),
    min_similarity: z.number().min(0.5).max(0.95).optional().default(0.6),
    project: z.string().optional(),
    prioritize_cross_cluster: z.boolean().optional().default(true),
    prioritize_highways: z.boolean().optional().default(true),
  },
  async ({ limit, min_similarity, project, prioritize_cross_cluster, prioritize_highways }) => {
    const memories = await getAllMemoriesWithEmbeddings();
    const filtered = project ? memories.filter(m => m.project === project) : memories;
    
    if (filtered.length < 2) {
      return { content: [{ type: "text" as const, text: "Need at least 2 memories." }] };
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
```

---

### 3. `apply_link` - Create a link between two memories

**Purpose:** Actually create a rich link with type, reason, and strength.

```typescript
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
    strength: z.number().min(0).max(1).optional().default(0.8),
    bidirectional: z.boolean().optional().default(true).describe("Create reverse link too"),
  },
  async ({ source_id, target_id, link_type, reason, strength, bidirectional }) => {
    // Verify both memories exist
    const source = await getMemory(source_id);
    const target = await getMemory(target_id);
    
    if (!source) {
      return { content: [{ type: "text" as const, text: `❌ Source memory not found: ${source_id}` }] };
    }
    if (!target) {
      return { content: [{ type: "text" as const, text: `❌ Target memory not found: ${target_id}` }] };
    }
    
    // Create the link
    await addMemoryLink(source_id, {
      targetId: target_id,
      type: link_type,
      reason: reason || `${link_type} relationship`,
      strength,
      createdBy: "conscious",
    });
    
    let resultText = `✅ Created link: ${source_id} --[${link_type}]--> ${target_id}`;
    
    // Create reverse link if bidirectional
    if (bidirectional) {
      const reverseType = getReverseLinkType(link_type);
      await addMemoryLink(target_id, {
        targetId: source_id,
        type: reverseType,
        reason: reason || `${reverseType} relationship (reverse)`,
        strength,
        createdBy: "conscious",
      });
      resultText += `\n✅ Created reverse: ${target_id} --[${reverseType}]--> ${source_id}`;
    }
    
    return { content: [{ type: "text" as const, text: resultText }] };
  }
);

// Helper function - add near the tool or in a utils section
function getReverseLinkType(linkType: string): string {
  const reverseMap: Record<string, string> = {
    "supports": "supported_by",      // If A supports B, B is supported_by A
    "contradicts": "contradicts",    // Symmetric
    "extends": "extended_by",
    "supersedes": "superseded_by",
    "depends_on": "depended_on_by",
    "caused_by": "causes",
    "implements": "implemented_by",
    "example_of": "has_example",
    "related": "related",            // Symmetric
  };
  return reverseMap[linkType] || "related";
}
```

---

### 4. `get_memory_links` - View links for a memory

**Purpose:** See all links (incoming and outgoing) for a specific memory.

**Note:** You'll need to add `getMemoryLinks()` function to `db.ts` first (see DB additions below).

```typescript
server.tool(
  "get_memory_links",
  {
    memory_id: z.string().describe("Memory ID to get links for"),
    direction: z.enum(["outgoing", "incoming", "both"]).optional().default("both"),
  },
  async ({ memory_id, direction }) => {
    const memory = await getMemory(memory_id);
    if (!memory) {
      return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
    }
    
    const sections: string[] = [];
    sections.push(`🔗 LINKS FOR: "${memory.content.slice(0, 60)}..."\n`);
    
    // Outgoing links (from this memory)
    if (direction === "outgoing" || direction === "both") {
      const outgoing = memory.links || [];
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
    
    // Incoming links (to this memory) - need to search all memories
    if (direction === "incoming" || direction === "both") {
      const allMemories = await listMemories({ limit: 1000 });
      const incoming: Array<{ from: Memory; link: any }> = [];
      
      for (const m of allMemories) {
        if (m.links) {
          for (const link of m.links) {
            if (link.targetId === memory_id) {
              incoming.push({ from: m, link });
            }
          }
        }
        // Also check simple related_memories
        if (m.related_memories?.includes(memory_id)) {
          incoming.push({ from: m, link: { type: "related", targetId: memory_id } });
        }
      }
      
      sections.push(`\n📥 INCOMING (${incoming.length}):`);
      if (incoming.length === 0) {
        sections.push("   None");
      } else {
        for (const { from, link } of incoming) {
          sections.push(`   "${from.content.slice(0, 40)}..." --[${link.type}]-->`);
        }
      }
    }
    
    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);
```

---

### 5. `policy_status` - View and manage the policy engine

**Purpose:** See trust scores, approval rates, and configure policy.

```typescript
import {
  PolicyEngine,
  createPersistentPolicyEngine,
  savePolicyEngine,
  ACTION_METADATA,
  type TrustScore,
  type WalkerAction,
} from "./policy.js";

// Initialize policy engine at module level (after other initializations)
const policyEngine = createPersistentPolicyEngine();

server.tool(
  "policy_status",
  {
    action: z.enum(["status", "trust_details", "reset_trust", "set_override"])
      .describe("status: overview. trust_details: per-action scores. reset_trust: reset one action. set_override: force decision."),
    walker_action: z.string().optional()
      .describe("For reset_trust/set_override: which action (e.g., 'link_memories', 'consolidate')"),
    override_decision: z.enum(["auto", "review", "deny"]).optional()
      .describe("For set_override: the forced decision"),
  },
  async ({ action, walker_action, override_decision }) => {
    const sections: string[] = [];
    
    switch (action) {
      case "status": {
        const status = policyEngine.getStatus();
        sections.push(`⚖️ POLICY ENGINE STATUS\n${"═".repeat(40)}\n`);
        sections.push(`Enabled: ${status.enabled}`);
        sections.push(`Total proposals processed: ${status.totalProposals}`);
        sections.push(`Approval rate: ${(status.approvalRate * 100).toFixed(1)}%`);
        sections.push(`Human review rate: ${(status.humanReviewRate * 100).toFixed(1)}%`);
        sections.push(`\nActions with trust scores: ${status.trustScores.length}`);
        
        // Summary of trust levels
        const highTrust = status.trustScores.filter(t => t.score >= 0.7);
        const medTrust = status.trustScores.filter(t => t.score >= 0.4 && t.score < 0.7);
        const lowTrust = status.trustScores.filter(t => t.score < 0.4);
        
        sections.push(`  High trust (≥70%): ${highTrust.length} actions`);
        sections.push(`  Medium trust (40-70%): ${medTrust.length} actions`);
        sections.push(`  Low trust (<40%): ${lowTrust.length} actions`);
        sections.push(`\n💡 Use policy_status({ action: "trust_details" }) for per-action breakdown.`);
        break;
      }
      
      case "trust_details": {
        const status = policyEngine.getStatus();
        sections.push(`📊 TRUST SCORES BY ACTION\n${"═".repeat(40)}\n`);
        
        // Show all action types with their metadata and current trust
        const allActions = Object.keys(ACTION_METADATA) as WalkerAction[];
        
        for (const act of allActions) {
          const meta = ACTION_METADATA[act];
          const trust = status.trustScores.find(t => t.action === act);
          const score = trust?.score ?? 0;
          const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));
          
          sections.push(`${act}:`);
          sections.push(`  Trust: [${bar}] ${(score * 100).toFixed(0)}%`);
          sections.push(`  Risk: ${meta.risk} | Default: ${meta.defaultDecision} | Min trust for auto: ${(meta.minTrustForAuto * 100).toFixed(0)}%`);
          if (trust) {
            sections.push(`  History: ${trust.approved} approved, ${trust.rejected} rejected, ${trust.autoApproved} auto`);
          }
          sections.push("");
        }
        break;
      }
      
      case "reset_trust": {
        if (!walker_action) {
          return { content: [{ type: "text" as const, text: "❌ walker_action required for reset_trust" }] };
        }
        
        // Reset by setting a fresh trust score
        policyEngine.setTrustScore({
          action: walker_action as WalkerAction,
          score: 0,
          totalProposals: 0,
          approved: 0,
          rejected: 0,
          autoApproved: 0,
          lastUpdated: new Date().toISOString(),
        });
        savePolicyEngine(policyEngine);
        
        sections.push(`✅ Reset trust for "${walker_action}" to 0%`);
        sections.push(`The system will now require review for this action until trust is rebuilt.`);
        break;
      }
      
      case "set_override": {
        if (!walker_action || !override_decision) {
          return { content: [{ type: "text" as const, text: "❌ walker_action and override_decision required" }] };
        }
        
        // Note: This would require adding override support to PolicyEngine
        // For now, provide guidance
        sections.push(`⚠️ Policy overrides require modifying the PolicyEngine config.`);
        sections.push(`\nTo force "${override_decision}" for "${walker_action}":`);
        sections.push(`Edit ~/.claude-memory/policy-config.json and add:`);
        sections.push(`  "actionOverrides": { "${walker_action}": "${override_decision}" }`);
        break;
      }
    }
    
    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);
```

---

### 6. `assign_project` - Assign a memory to a project

**Purpose:** Move a memory to a project for organization.

```typescript
server.tool(
  "assign_project",
  {
    memory_id: z.string().describe("Memory ID to assign"),
    project: z.string().describe("Project name to assign to"),
  },
  async ({ memory_id, project }) => {
    const memory = await getMemory(memory_id);
    if (!memory) {
      return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
    }
    
    const oldProject = memory.project || "unassigned";
    await updateMemory(memory_id, { project });
    
    return {
      content: [{
        type: "text" as const,
        text: `✅ Moved memory from "${oldProject}" to "${project}"\n   "${memory.content.slice(0, 60)}..."`,
      }],
    };
  }
);
```

---

### 7. `bulk_assign_projects` - Analyze and assign projects in bulk

**Purpose:** Suggest project assignments for unassigned memories based on semantic similarity.

```typescript
server.tool(
  "bulk_assign_projects",
  {
    action: z.enum(["analyze", "suggest", "apply"])
      .describe("analyze: show stats. suggest: propose assignments. apply: execute assignments."),
    assignments: z.array(z.object({
      memory_id: z.string(),
      project: z.string(),
    })).optional().describe("For apply: the assignments to execute"),
    limit: z.number().optional().default(20).describe("Max suggestions to generate"),
  },
  async ({ action, assignments, limit }) => {
    const sections: string[] = [];
    
    switch (action) {
      case "analyze": {
        const stats = await getMemoryStats();
        const unassigned = stats.byProject["unassigned"] || stats.byProject[""] || 0;
        const projects = await listProjects();
        
        sections.push(`📊 PROJECT ASSIGNMENT ANALYSIS\n${"═".repeat(40)}\n`);
        sections.push(`Total memories: ${stats.total}`);
        sections.push(`Unassigned: ${unassigned} (${((unassigned / stats.total) * 100).toFixed(1)}%)`);
        sections.push(`\nExisting projects (${projects.length}):`);
        
        for (const p of projects) {
          const count = stats.byProject[p.name] || 0;
          sections.push(`  • ${p.name}: ${count} memories`);
        }
        
        sections.push(`\n💡 Use bulk_assign_projects({ action: "suggest" }) to get assignment proposals.`);
        break;
      }
      
      case "suggest": {
        // Get unassigned memories
        const allMemories = await listMemories({ limit: 500 });
        const unassigned = allMemories.filter(m => !m.project || m.project === "");
        
        if (unassigned.length === 0) {
          return { content: [{ type: "text" as const, text: "✅ All memories are assigned to projects!" }] };
        }
        
        // Get project memories for comparison
        const projects = await listProjects();
        const projectMemories: Record<string, Memory[]> = {};
        
        for (const p of projects) {
          projectMemories[p.name] = allMemories.filter(m => m.project === p.name);
        }
        
        sections.push(`📋 SUGGESTED ASSIGNMENTS (${Math.min(unassigned.length, limit)} of ${unassigned.length})\n`);
        
        // For each unassigned memory, find best matching project by tag overlap
        const suggestions: Array<{ memory_id: string; project: string; reason: string }> = [];
        
        for (const mem of unassigned.slice(0, limit)) {
          let bestProject = "";
          let bestScore = 0;
          let bestReason = "";
          
          for (const [projName, projMems] of Object.entries(projectMemories)) {
            if (projMems.length === 0) continue;
            
            // Score by tag overlap
            const projTags = new Set(projMems.flatMap(m => m.tags));
            const memTags = new Set(mem.tags);
            const overlap = [...memTags].filter(t => projTags.has(t));
            const score = overlap.length / Math.max(memTags.size, 1);
            
            if (score > bestScore) {
              bestScore = score;
              bestProject = projName;
              bestReason = overlap.length > 0 ? `Tags: ${overlap.slice(0, 3).join(", ")}` : "Best semantic match";
            }
          }
          
          if (bestProject && bestScore > 0.2) {
            suggestions.push({ memory_id: mem.id, project: bestProject, reason: bestReason });
            sections.push(`• "${mem.content.slice(0, 50)}..."`);
            sections.push(`  → ${bestProject} (${bestReason})`);
            sections.push("");
          }
        }
        
        if (suggestions.length > 0) {
          sections.push(`\n💡 To apply these suggestions:`);
          sections.push(`bulk_assign_projects({`);
          sections.push(`  action: "apply",`);
          sections.push(`  assignments: [`);
          for (const s of suggestions.slice(0, 5)) {
            sections.push(`    { memory_id: "${s.memory_id}", project: "${s.project}" },`);
          }
          if (suggestions.length > 5) sections.push(`    // ... ${suggestions.length - 5} more`);
          sections.push(`  ]`);
          sections.push(`})`);
        }
        break;
      }
      
      case "apply": {
        if (!assignments || assignments.length === 0) {
          return { content: [{ type: "text" as const, text: "❌ No assignments provided" }] };
        }
        
        let success = 0;
        let failed = 0;
        
        for (const { memory_id, project } of assignments) {
          try {
            await updateMemory(memory_id, { project });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        sections.push(`✅ Applied ${success} assignments`);
        if (failed > 0) sections.push(`❌ Failed: ${failed}`);
        break;
      }
    }
    
    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);
```

---

## DB Additions (add to src/db.ts)

You'll need to add this function to `db.ts` to support rich link retrieval:

```typescript
/**
 * Get all links for a memory (parses links_json from metadata)
 */
export async function getMemoryLinks(memoryId: string): Promise<MemoryLink[]> {
  if (!memoriesCollection) await initDb();
  
  const results = await memoriesCollection!.get({
    ids: [memoryId],
    include: [IncludeEnum.Metadatas],
  });
  
  if (!results.ids.length) return [];
  
  const metadata = results.metadatas?.[0] || {};
  
  if (metadata.links_json) {
    try {
      return JSON.parse(metadata.links_json as string);
    } catch {
      return [];
    }
  }
  
  return [];
}

/**
 * Remove a specific link from a memory
 */
export async function removeMemoryLink(
  memoryId: string,
  targetId: string,
  linkType?: string
): Promise<boolean> {
  if (!memoriesCollection) await initDb();
  
  const results = await memoriesCollection!.get({
    ids: [memoryId],
    include: [IncludeEnum.Metadatas],
  });
  
  if (!results.ids.length) return false;
  
  const metadata = results.metadatas?.[0] || {};
  let links: any[] = [];
  
  if (metadata.links_json) {
    try {
      links = JSON.parse(metadata.links_json as string);
    } catch {
      links = [];
    }
  }
  
  const originalLength = links.length;
  links = links.filter(l => {
    if (l.targetId !== targetId) return true;
    if (linkType && l.type !== linkType) return true;
    return false;
  });
  
  if (links.length === originalLength) return false;
  
  // Also update simple related_memories
  let relatedMemories = ((metadata.related_memories as string) || "").split(",").filter(Boolean);
  relatedMemories = relatedMemories.filter(id => id !== targetId);
  
  await memoriesCollection!.update({
    ids: [memoryId],
    metadatas: [{
      ...metadata,
      links_json: JSON.stringify(links),
      related_memories: relatedMemories.join(","),
    }],
  });
  
  return true;
}
```

---

## Imports Summary

Add these imports at the top of `index.ts`:

```typescript
import {
  analyzeGraphEnrichment,
  generateProposedLinks,
  proposedLinkToMemoryLink,
  type ProposedLink,
  type EnrichmentResult,
} from "./graph-enrichment.js";

import {
  PolicyEngine,
  createPersistentPolicyEngine,
  savePolicyEngine,
  createProposal,
  ACTION_METADATA,
  WALKER_CAPABILITIES,
  type TrustScore,
  type WalkerAction,
  type Proposal,
} from "./policy.js";
```

Also add to the db.ts imports in index.ts:
```typescript
import {
  // ... existing imports ...
  addMemoryLink,
  getMemoryLinks,
  removeMemoryLink,
} from "./db.js";
```

---

## Testing

After implementation, test with:

```bash
npm run build
# Restart Claude Desktop, then:
```

In Claude Desktop:
1. `graph_analysis` - Should show clusters and highways
2. `propose_links({ limit: 5 })` - Should generate link proposals
3. `apply_link({ source_id: "...", target_id: "...", link_type: "related" })` - Should create link
4. `policy_status({ action: "status" })` - Should show policy overview
5. `bulk_assign_projects({ action: "analyze" })` - Should show project stats

---

## Priority Order

1. `assign_project` - Simple, high value
2. `apply_link` - Enables manual linking
3. `graph_analysis` - Visibility into graph state
4. `propose_links` - Automated link discovery
5. `get_memory_links` - Link introspection
6. `policy_status` - Policy visibility
7. `bulk_assign_projects` - Batch organization
