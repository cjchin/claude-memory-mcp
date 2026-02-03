# Soul-MCP Walker Implementation Prompt

## Context

You are implementing walker agents and self-reorganization tools for the soul-mcp cognitive infrastructure system. The codebase is a TypeScript MCP server at `C:\DEV\RAG-Context`.

**Existing modules:**
- `src/index.ts` - MCP server with 21 tools (remember, recall, find_similar, merge_memories, etc.)
- `src/policy.ts` - Policy layer with graduated autonomy (trust scores, proposal system, action types) - **NOT EXPOSED AS TOOLS**
- `src/graph-enrichment.ts` - Graph analysis (clustering, centrality, highway detection, link inference) - **NOT EXPOSED AS TOOLS**
- `src/dream.ts` - Dream cycle operations (consolidation, decay, contradiction detection) - **NOT EXPOSED AS TOOLS**
- `src/hybrid-search.ts` - BM25 + semantic + graph hybrid search - **USED INTERNALLY BY recall**
- `src/db.ts` - ChromaDB interface with `addMemoryLink()`, `getAllMemoriesWithEmbeddings()`, `supersedeMemory()`
- `src/types.ts` - Memory, MemoryLink, LinkType, WalkerAction, DreamOperation types

**Current state:**
- 235 memories in ChromaDB
- 227 unassigned to projects (only 8 assigned)
- Policy layer implemented but **NO MCP TOOLS** to invoke it
- Graph enrichment implemented but **NO MCP TOOLS** to run it
- Dream cycle implemented but **NO MCP TOOLS** to trigger it
- `db.ts` has `addMemoryLink()` but **NO MCP TOOL** exposes it
- No walker execution or proposal review tools
- No way to see or interact with the policy/trust system

## Critical Gap Summary

| Module | Code Exists | MCP Tool Exposed |
|--------|-------------|------------------|
| Policy Engine | ✅ `src/policy.ts` | ❌ No tools |
| Graph Enrichment | ✅ `src/graph-enrichment.ts` | ❌ No tools |
| Dream Cycle | ✅ `src/dream.ts` | ❌ No tools |
| Link Application | ✅ `db.addMemoryLink()` | ❌ No tools |
| Proposal Storage | ❌ Not implemented | ❌ No tools |
| Walker Execution | ❌ Not implemented | ❌ No tools |

The code is there but Claude Desktop can't call it!

## What's Missing

### 1. Proposal Storage System (NEW MODULE)

Create `src/proposals.ts`:
```typescript
import type { Proposal } from "./policy.js";

// Store proposals in ChromaDB metadata collection or file
interface ProposalStore {
  save(proposal: Proposal): Promise<void>;
  get(id: string): Promise<Proposal | null>;
  list(filters?: { 
    status?: "pending" | "approved" | "rejected" | "expired";
    action?: WalkerAction;
    walkerId?: string;
  }): Promise<Proposal[]>;
  update(id: string, updates: Partial<Proposal>): Promise<void>;
  expireOld(maxAgeDays?: number): Promise<number>;
}

// Could use:
// Option A: New ChromaDB collection "claude_proposals"
// Option B: JSON file at ~/.claude-memory/proposals.json
// Option C: SQLite for more complex queries
```

### 2. MCP Tools to Expose Existing Functionality

Add to `src/index.ts`:

#### `run_dream` - Trigger dream cycle
```typescript
server.tool("run_dream", {
  operations: z.array(z.enum(["consolidate", "decay", "contradiction", "prune", "link", "summarize"])).optional(),
  dry_run: z.boolean().optional().default(true),
  project: z.string().optional(),
}, async ({ operations, dry_run, project }) => {
  // Uses: dream.ts runDreamCycleWithMutations()
  // 1. Get all memories (optionally filtered by project)
  // 2. Run requested dream operations
  // 3. Return DreamReport
});
```

#### `propose_links` - Generate link proposals from graph analysis
```typescript
server.tool("propose_links", {
  limit: z.number().optional().default(20),
  min_similarity: z.number().optional().default(0.6),
  auto_approve_low_risk: z.boolean().optional().default(false),
}, async ({ limit, min_similarity, auto_approve_low_risk }) => {
  // Uses: graph-enrichment.ts analyzeGraphEnrichment()
  // Uses: policy.ts PolicyEngine.decide(), createProposal()
  // Uses: db.ts getAllMemoriesWithEmbeddings()
  // 1. Get memories with embeddings
  // 2. Run analyzeGraphEnrichment()
  // 3. For each proposed link, create Proposal
  // 4. Check policy decision
  // 5. If auto_approve and decision is "auto", apply via db.addMemoryLink()
  // 6. Otherwise save to proposal store
});
```

#### `apply_link` - Apply a single link (for manual/approved operations)
```typescript
server.tool("apply_link", {
  source_id: z.string(),
  target_id: z.string(),
  link_type: z.enum(["related", "supports", "contradicts", "extends", "supersedes", "depends_on", "caused_by", "implements", "example_of"]),
  reason: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  bidirectional: z.boolean().optional().default(true),
}, async ({ source_id, target_id, link_type, reason, strength, bidirectional }) => {
  // Uses: db.ts addMemoryLink()
  // Creates the link, optionally bidirectional
});
```

#### `review_proposals` - View and act on pending proposals
```typescript
server.tool("review_proposals", {
  action: z.enum(["list", "approve", "reject", "approve_all", "reject_all"]),
  proposal_id: z.string().optional(),
  filter_action: z.enum(["link_memories", "consolidate", "tag", "decay", "prune", "reclassify", "supersede"]).optional(),
  filter_walker: z.string().optional(),
}, async ({ action, proposal_id, filter_action, filter_walker }) => {
  // Uses: proposals.ts ProposalStore
  // Uses: policy.ts PolicyEngine.recordOutcome()
  // list: Return pending proposals
  // approve/reject: Update proposal, record outcome, apply if approved
  // approve_all/reject_all: Batch with filters
});
```

#### `run_walker` - Execute a specific walker
```typescript
server.tool("run_walker", {
  walker_type: z.enum(["linker", "consolidator", "tagger", "decayer", "pruner", "contradiction"]),
  dry_run: z.boolean().optional().default(true),
  project: z.string().optional(),
  limit: z.number().optional().default(50),
}, async ({ walker_type, dry_run, project, limit }) => {
  // Dispatches to specific walker logic:
  // - linker: Use graph-enrichment.ts
  // - consolidator: Use dream.ts findConsolidationCandidates()
  // - tagger: Use intelligence.ts detectTags() on memories with few tags
  // - decayer: Use dream.ts calculateDecay()
  // - pruner: Find low importance + old + low access memories
  // - contradiction: Use dream.ts detectContradiction()
  
  // All generate proposals, not direct changes (unless trust is high)
});
```

#### `policy_status` - View and manage the policy engine
```typescript
server.tool("policy_status", {
  action: z.enum(["status", "trust_scores", "reset_trust", "set_override"]),
  walker_action: z.string().optional(),
  override_decision: z.enum(["auto", "review", "deny"]).optional(),
}, async ({ action, walker_action, override_decision }) => {
  // Uses: policy.ts PolicyEngine, loadTrustScores(), saveTrustScores()
  // status: Overall policy status
  // trust_scores: Detailed trust per action type
  // reset_trust: Reset trust for specific action
  // set_override: Force decision for action type
});
```

#### `graph_analysis` - View memory graph topology
```typescript
server.tool("graph_analysis", {
  include_clusters: z.boolean().optional().default(true),
  include_highways: z.boolean().optional().default(true),
  include_orphans: z.boolean().optional().default(true),
  project: z.string().optional(),
}, async ({ include_clusters, include_highways, include_orphans, project }) => {
  // Uses: graph-enrichment.ts analyzeGraphEnrichment()
  // Uses: db.ts getAllMemoriesWithEmbeddings()
  // Returns:
  // - Cluster count and sizes
  // - Highway memories (high centrality)
  // - Orphan memories (no links)
  // - Cross-cluster bridge opportunities
});
```

#### `assign_projects` - Batch project assignment
```typescript
server.tool("assign_projects", {
  action: z.enum(["analyze", "suggest", "apply"]),
  mappings: z.array(z.object({
    memory_id: z.string(),
    project: z.string(),
  })).optional(),
}, async ({ action, mappings }) => {
  // analyze: Show stats on unassigned memories
  // suggest: Use semantic similarity to existing project memories
  // apply: Apply the provided mappings
});
```

#### `detect_contradictions` - Find conflicting memories
```typescript
server.tool("detect_contradictions", {
  project: z.string().optional(),
  min_confidence: z.number().optional().default(0.6),
}, async ({ project, min_confidence }) => {
  // Uses: dream.ts detectContradiction()
  // Returns list of potential conflicts with explanations
});
```

### 3. Walker Base Class (NEW MODULE)

Create `src/walkers.ts`:
```typescript
import { PolicyEngine, WalkerType, WalkerAction, Proposal, createProposal, WALKER_CAPABILITIES } from "./policy.js";
import { ProposalStore } from "./proposals.js";

interface WalkerResult {
  proposed: number;
  autoApproved: number;
  needsReview: number;
  errors: string[];
}

abstract class BaseWalker {
  protected policy: PolicyEngine;
  protected proposals: ProposalStore;
  protected type: WalkerType;
  protected id: string;
  
  constructor(type: WalkerType, policy: PolicyEngine, proposals: ProposalStore) {
    this.type = type;
    this.policy = policy;
    this.proposals = proposals;
    this.id = `${type}_${Date.now()}`;
  }
  
  abstract analyze(options: any): Promise<Proposal[]>;
  abstract execute(proposal: Proposal): Promise<void>;
  
  async run(options: { dryRun?: boolean; project?: string; limit?: number } = {}): Promise<WalkerResult> {
    const { dryRun = true, project, limit = 50 } = options;
    const proposals = await this.analyze({ project, limit });
    const results: WalkerResult = { proposed: 0, autoApproved: 0, needsReview: 0, errors: [] };
    
    for (const proposal of proposals) {
      const decision = this.policy.decide(proposal.action, {
        targetType: /* from proposal */,
        targetImportance: /* from proposal */,
      });
      
      results.proposed++;
      
      if (decision === "deny") {
        continue;
      }
      
      if (decision === "auto" && !dryRun) {
        try {
          await this.execute(proposal);
          proposal.status = "auto";
          this.policy.recordOutcome(proposal.action, "auto");
          results.autoApproved++;
        } catch (e) {
          results.errors.push(`${proposal.id}: ${e}`);
        }
      } else {
        proposal.status = "pending";
        await this.proposals.save(proposal);
        results.needsReview++;
      }
    }
    
    return results;
  }
}

export class LinkerWalker extends BaseWalker {
  constructor(policy: PolicyEngine, proposals: ProposalStore) {
    super("linker", policy, proposals);
  }
  
  async analyze({ project, limit }): Promise<Proposal[]> {
    // Use graph-enrichment.ts generateProposedLinks()
    // Convert ProposedLink to Proposal
  }
  
  async execute(proposal: Proposal): Promise<void> {
    // Use db.ts addMemoryLink()
  }
}

export class ConsolidatorWalker extends BaseWalker { /* uses dream.ts */ }
export class TaggerWalker extends BaseWalker { /* uses intelligence.ts */ }
export class DecayerWalker extends BaseWalker { /* uses dream.ts */ }
export class PrunerWalker extends BaseWalker { /* uses db.ts */ }
export class ContradictionWalker extends BaseWalker { /* uses dream.ts */ }
```

### 4. Integration Points

**From `graph-enrichment.ts` (already implemented):**
- `analyzeGraphEnrichment(memories)` - Full analysis
- `generateProposedLinks(memories, options)` - Link proposals
- `proposedLinkToMemoryLink(proposed)` - Convert to MemoryLink
- `identifyHighways(centrality)` - Find central nodes
- `clusterMemories(neighbors)` - Find semantic clusters

**From `policy.ts` (already implemented):**
- `PolicyEngine` - Decision making
- `createProposal()` - Create proposals
- `createPersistentPolicyEngine()` - Load with trust scores
- `savePolicyEngine()` - Persist trust scores
- `WALKER_CAPABILITIES` - Which actions each walker can do
- `ACTION_METADATA` - Risk levels, default decisions

**From `dream.ts` (already implemented):**
- `runDreamCycleWithMutations()` - Full dream cycle
- `findConsolidationCandidates()` - Find similar memories
- `detectContradiction()` - Find conflicts
- `calculateDecay()` - Importance decay

**From `db.ts` (already implemented):**
- `addMemoryLink()` - Create rich links ✅
- `getAllMemoriesWithEmbeddings()` - For graph analysis ✅
- `supersedeMemory()` - Mark as replaced ✅
- `findSimilarMemories()` - For consolidation ✅
- `updateMemory()` - For applying changes ✅

## Implementation Priority

1. **Proposal Storage** (`src/proposals.ts`) - Need to persist proposals first
2. **`apply_link`** - Basic ability to create links manually
3. **`run_dream`** - Expose existing dream functionality
4. **`graph_analysis`** - See the current state
5. **`propose_links`** - Generate link proposals
6. **`detect_contradictions`** - Find conflicts
7. **`policy_status`** - Visibility into trust system
8. **`review_proposals`** - Human-in-the-loop review
9. **Walker Base Class** (`src/walkers.ts`)
10. **`run_walker`** - Unified walker execution
11. **`assign_projects`** - Batch organization

## Testing

Add to `tests/`:
```typescript
describe("Walker Tools", () => {
  describe("apply_link", () => {
    it("creates unidirectional link");
    it("creates bidirectional link");
    it("rejects invalid memory IDs");
  });
  
  describe("run_dream", () => {
    it("runs decay operation");
    it("finds contradictions");
    it("respects dry_run flag");
  });
  
  describe("propose_links", () => {
    it("generates proposals from graph analysis");
    it("respects min_similarity threshold");
    it("auto-approves low-risk with flag");
  });
  
  describe("review_proposals", () => {
    it("lists pending proposals");
    it("approves and applies proposal");
    it("rejects and records outcome");
    it("updates trust scores on outcome");
  });
  
  describe("policy_status", () => {
    it("shows current trust scores");
    it("resets trust for action");
    it("sets decision override");
  });
});
```

## File Structure After Implementation

```
src/
├── index.ts          # Add 9 new tools here
├── walkers.ts        # NEW: Walker base class + implementations
├── proposals.ts      # NEW: Proposal storage
├── policy.ts         # Existing: Already complete
├── graph-enrichment.ts # Existing: Already complete
├── dream.ts          # Existing: Already complete
├── hybrid-search.ts  # Existing: Already complete
├── db.ts             # Existing: Has addMemoryLink etc
└── types.ts          # Existing: Has all types needed
```

## Key Insight

The soul-mcp has sophisticated backend logic for:
- Graph analysis with clusters and highways
- Policy-based graduated autonomy
- Dream cycle consolidation and decay
- Rich Zettelkasten-style links

**But none of it is accessible via MCP tools!**

Claude Desktop calls MCP tools. If there's no tool, the feature doesn't exist from Claude's perspective. The implementation work is mostly about **exposing** existing functionality, not building new algorithms.

## Notes

- All walkers should generate proposals, not direct changes (graduated autonomy)
- Trust builds over time as proposals are approved
- Critical/high-importance memories always need review
- The goal is that Claude Desktop can call these tools to initiate self-reorganization
- Eventually walkers run on schedule (cron) but initially triggered manually via these tools
