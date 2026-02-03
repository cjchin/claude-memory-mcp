# Soul-MCP System Architecture

**Version**: 1.0.0
**Last Updated**: 2026-02-02
**Purpose**: Complete technical breakdown of the claude-memory-mcp ("digital soul") system

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Philosophy & Design Principles](#philosophy--design-principles)
3. [Architecture Layers](#architecture-layers)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Tool Ecosystem](#tool-ecosystem)
7. [Memory Lifecycle](#memory-lifecycle)
8. [Dream State Operations](#dream-state-operations)
9. [Tool Consolidation (v2.0)](#tool-consolidation-v20)
10. [Future Implementation Roadmap](#future-implementation-roadmap)

---

## System Overview

**Soul-MCP** is a persistent memory substrate for Claude that provides:
- **Long-term memory** across sessions
- **Semantic search** via vector embeddings
- **Auto-detection** of insights from conversations
- **Temporal reasoning** with belief evolution
- **Dream states** for memory consolidation
- **Shadow log** for ephemeral working memory
- **Graph enrichment** with semantic links

**Technology Stack**:
- **Runtime**: Node.js + TypeScript
- **Vector DB**: ChromaDB (persistent)
- **Embeddings**: Local (`all-MiniLM-L6-v2` via transformers.js, 384 dimensions)
- **Protocol**: MCP (Model Context Protocol)
- **Optional LLM**: Ollama/OpenAI/Anthropic for dream-state judgment

**Storage Locations**:
- ChromaDB data: `C:/dev/RAG-Context/chroma-data/`
- Configuration: `~/.claude-memory/config.json`
- Shadow log: `~/.claude-memory/shadow-log.json`

---

## Philosophy & Design Principles

### 1. **Cognitive Architecture Metaphor**

The system models human cognitive processes:

```
┌─────────────────────────────────────────────────────────┐
│  CONSCIOUS MIND (Claude Session)                        │
│  - Active working memory                                │
│  - Current conversation context                         │
└─────────────────┬───────────────────────────────────────┘
                  │
         ┌────────▼────────┐
         │  SHADOW LOG     │ ← Ephemeral working memory
         │  (Short-term)   │   Tracks activity, promotes
         └────────┬────────┘   to long-term when dense
                  │
         ┌────────▼────────┐
         │  LONG-TERM      │ ← Consolidated memories
         │  MEMORY         │   Semantic search, decay
         │  (ChromaDB)     │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  FOUNDATIONAL   │ ← Core identity, immutable
         │  LAYER          │   Goals, values, constraints
         └─────────────────┘
                  │
         ┌────────▼────────┐
         │  DREAM STATE    │ ← Unconscious processing
         │  (Background)   │   Consolidate, detect contradictions
         └─────────────────┘
```

### 2. **Zettelkasten Principles**

- **Atomic Notes**: Each memory is discrete and self-contained
- **Rich Links**: Connections have types and reasons (not just IDs)
- **Bottom-Up Organization**: Tags emerge from content, not imposed
- **Permanence**: Once remembered, never truly deleted (superseded, not erased)

### 3. **Bi-Directional Alignment**

The system detects save/recall triggers in BOTH directions:
- **User → Soul**: "We decided to use X" → auto-save decision
- **Soul → User**: "What did we decide?" → auto-recall

### 4. **Temporal Reasoning**

Beliefs evolve over time:
- `valid_from`: When this became true
- `valid_until`: When it was superseded
- `supersedes`: What it replaced
- Enables "as-of" queries (planned)

---

## Architecture Layers

### Layer 1: **MCP Server** (`src/index.ts`)

Entry point that registers all tools and resources. Clean, minimal orchestration.

```typescript
// Modular tool registration
registerCoreTools(server);       // remember, recall, forget, etc.
registerAutonomousTools(server); // prime, align, synthesize
registerSessionTools(server);    // start/end session
registerProjectTools(server);    // set/list projects
registerUtilityTools(server);    // merge, find_similar
registerShadowTools(server);     // shadow log management
registerIntrospectTools(server); // introspect capabilities
registerLlmTools(server);        // configure LLM
registerGraphTools(server);      // graph analysis, links
registerPolicyTools(server);     // policy status, assignments
registerDreamTools(server);      // dream cycle operations
```

### Layer 2: **Intelligence Layer** (`src/intelligence.ts`, `src/autonomous.ts`)

Auto-detection and trigger recognition:

- **Type Detection**: Classify content as decision, pattern, learning, etc.
- **Tag Detection**: Extract relevant tags (architecture, api, database, etc.)
- **Importance Estimation**: Score 1-5 based on keywords and structure
- **Trigger Detection**: Recognize implicit save/recall intents
- **Conversation Analysis**: Extract insights from user ↔ Claude exchanges

### Layer 3: **Persistence Layer** (`src/db.ts`)

ChromaDB operations with semantic search:

- **saveMemory()**: Store with embedding
- **searchMemories()**: Vector similarity + hybrid search
- **updateMemory()**: Modify existing memories
- **deleteMemory()**: Remove (or mark as superseded)
- **listMemories()**: Browse with filters
- **Session Management**: Track memories per session
- **Project Management**: Scope memories to projects

### Layer 4: **Shadow Log** (`src/shadow-log.ts`)

Ephemeral working memory that tracks activity:

- **Accumulation**: Records file reads/writes, searches, commands, tool uses
- **Deduplication**: Collapses repeated activities (e.g., reading same file 10× → 1 entry with count=10)
- **Token Density**: Tracks accumulated complexity
- **Self-Reporting**: Claude can log activities via `log_activity` and `batch_log_activities` tools
- **Promotion**: Converts to long-term when:
  - Token density > 500, OR
  - Active for > 30 minutes
- **Claude-Assisted Synthesis**:
  - `prime` tool surfaces promotion candidates for Claude to review
  - `conclude` tool shows session shadows for reflection
  - Claude synthesizes insights and uses `remember` to save them
- **Decay**: Idle shadows expire after 24 hours
- **Storage**: JSON file (lightweight, no external deps)

### Layer 5: **Dream State** (`src/dream.ts`)

Background consolidation and maintenance:

- **Consolidation**: Merge similar memories
- **Contradiction Detection**: Find conflicting beliefs
- **Memory Decay**: Reduce importance over time
- **Pruning**: Archive low-value memories
- **LLM Judgment** (optional): Use local/remote LLM for smarter decisions

### Layer 6: **Graph Enrichment** (`src/graph-enrichment.ts`)

Semantic link analysis:

- **Link Proposals**: Suggest connections between memories
- **Graph Analysis**: Centrality, clustering, highways
- **Link Types**: `related`, `supports`, `contradicts`, `extends`, `supersedes`, etc.
- **Reason Tracking**: Store WHY memories are linked (Zettelkasten principle)

---

## Core Components

### Component Map

```
src/
├── index.ts              # MCP server entry point
├── config.ts             # Configuration management
├── types.ts              # TypeScript interfaces
│
├── db.ts                 # ChromaDB persistence
├── embeddings.ts         # Local embedding model
├── hybrid-search.ts      # Combined vector + keyword search
│
├── intelligence.ts       # Auto-detection (type/tags/importance)
├── autonomous.ts         # Trigger detection, extraction
├── alignment.ts          # Bidirectional alignment engine
├── preprocess.ts         # Text cleaning, entity extraction
│
├── shadow-log.ts         # Ephemeral working memory
├── dream.ts              # Consolidation, contradiction detection
├── graph-enrichment.ts   # Semantic link analysis
├── policy.ts             # Trust/autonomy layer
├── llm.ts                # LLM abstraction for dream state
├── introspect.ts         # Metacognition and capability awareness
│
├── tools/
│   ├── index.ts                 # Tool registration barrel
│   ├── core-tools.ts            # remember, recall, forget, etc.
│   ├── autonomous-tools.ts      # prime, align, synthesize
│   ├── session-tools.ts         # start/end session
│   ├── project-tools.ts         # set/list projects
│   ├── utility-tools.ts         # merge, find_similar
│   ├── shadow-tools.ts          # shadow log management
│   ├── introspect-tools.ts      # introspect
│   ├── llm-tools.ts             # configure_llm, llm_status
│   ├── graph-tools.ts           # graph_analysis, links
│   ├── policy-tools.ts          # policy_status
│   └── dream-tools.ts           # dream cycle operations
│
└── cli.ts                # CLI commands (report, consolidate, daemon)
```

### Key Data Structures

#### **Memory**

```typescript
interface Memory {
  id: string;                    // Unique identifier
  content: string;               // The actual memory text
  type: MemoryType;              // decision, pattern, learning, etc.
  tags: string[];                // Categorization tags

  // Temporal
  timestamp: string;             // Event time: when it happened
  ingestion_time?: string;       // When recorded (bi-temporal)
  valid_from?: string;           // When this became true
  valid_until?: string;          // When superseded

  // Relationships
  supersedes?: string;           // ID of memory this replaces
  superseded_by?: string;        // ID of memory that replaced this
  links?: MemoryLink[];          // Rich semantic links

  // Metadata
  project?: string;              // Project context
  session_id?: string;           // Session tracking
  importance: number;            // 1-5, affects retrieval
  access_count: number;          // Usage tracking
  last_accessed?: string;        // Last retrieval time
  layer?: MemoryLayer;           // conscious, long_term, foundational
  confidence?: number;           // 0-1, certainty level
  source?: string;               // Origin (human, inferred, llm, etc.)
}
```

#### **MemoryLink**

```typescript
interface MemoryLink {
  targetId: string;              // ID of linked memory
  type: LinkType;                // related, supports, contradicts, etc.
  reason?: string;               // WHY they're linked (Zettelkasten)
  strength?: number;             // 0-1, connection strength
  createdAt: string;             // When link was created
  createdBy?: string;            // human, walker, agent ID
}
```

#### **ShadowEntry**

```typescript
interface ShadowEntry {
  id: string;                    // shadow_<timestamp>_<random>
  session_id: string;            // Claude session ID
  topic: string;                 // Detected topic

  created_at: string;            // When shadow started
  last_activity: string;         // Last activity timestamp

  activities: ShadowActivity[];  // All recorded activities
  tokens: number;                // Accumulated density

  status: ShadowStatus;          // active, idle, promoted, decayed
  summary?: string;              // Generated when promoted

  project?: string;              // Project context
  promoted_memory_id?: string;   // Created memory ID
}
```

---

## Data Flow

### 1. **Conscious Interaction Flow** (User saves explicitly)

```
User: "Remember: We use TypeScript for all new services"
  │
  ├─> MCP Tool: remember(content, type?, tags?, importance?)
  │
  ├─> Preprocessing: cleanText(), extractEntities(), extractReasoning()
  │
  ├─> Intelligence: detectMemoryType(), detectTags(), estimateImportance()
  │
  ├─> Embedding: generateEmbedding(content) → [384D vector]
  │
  ├─> ChromaDB: saveMemory()
  │     - Store in "memories" collection
  │     - Generate unique ID
  │     - Add to current session
  │
  └─> Response: { id, type, tags, importance, summary }
```

### 2. **Unconscious Absorption Flow** (Auto-detection)

```
User: "We decided to use PostgreSQL because MySQL licensing is restrictive"
  │
  ├─> Autonomous: detectTriggers(message)
  │     - Pattern match: "decided", "because" → DECISION trigger
  │
  ├─> Autonomous: extractInsight(message)
  │     - Extract: "Use PostgreSQL over MySQL for licensing"
  │
  ├─> Auto-save: remember() with detected type="decision"
  │
  └─> Silent save (or notify user based on policy)
```

### 3. **Recall Flow** (Semantic search)

```
User: "What database did we choose?"
  │
  ├─> MCP Tool: recall(query="database decision", limit=5)
  │
  ├─> Embedding: generateEmbedding(query) → [384D vector]
  │
  ├─> ChromaDB: searchMemories()
  │     - Vector similarity search
  │     - Filter by type/project/tags (if specified)
  │     - Rank by similarity score
  │
  ├─> Hybrid Search: combine vector + BM25 keyword search
  │
  ├─> Update access metadata:
  │     - Increment access_count
  │     - Set last_accessed
  │
  └─> Response: [{ memory, score }, ...]
```

### 4. **Shadow Log Flow** (Ephemeral working memory)

```
Claude reads file: src/database/connection.ts
  │
  ├─> Shadow Log: recordActivity({
  │     type: "file_read",
  │     detail: "src/database/connection.ts",
  │     tokens: 120
  │   })
  │
  ├─> Accumulation: Add to active shadow entry for current session
  │
  ├─> Check density: tokens = 520 (> 500 threshold)
  │
  ├─> Promotion: Convert to long-term memory
  │     - Generate summary of activities
  │     - Save as type="context" with tag="database"
  │     - Mark shadow as "promoted"
  │
  └─> Cleanup: Mark old idle shadows for decay
```

### 5. **Dream State Flow** (Background consolidation)

```
Trigger: Manual (run_dream) or scheduled daemon
  │
  ├─> Find consolidation candidates:
  │     - Compute pairwise similarity
  │     - Threshold: 0.85 (very similar)
  │
  ├─> LLM Judgment (if enabled):
  │     - Prompt: "Should these memories merge?"
  │     - Response: { shouldMerge, mergedContent, reasoning }
  │
  ├─> Consolidation: mergeMemories()
  │     - Create new merged memory
  │     - Mark originals as superseded
  │     - Transfer links and metadata
  │
  ├─> Contradiction Detection:
  │     - Find conflicting beliefs
  │     - Flag for human review
  │
  ├─> Memory Decay:
  │     - Reduce importance over time
  │     - Boost on access
  │
  └─> Report: { consolidations, contradictions, decayed, pruned }
```

---

## Tool Ecosystem

### **43 Total Tools** across 11 modules:

#### **Core Tools** (7 tools) - `core-tools.ts`

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `remember` | Save a new memory | content, type?, tags?, importance?, project? | { id, type, tags, importance } |
| `recall` | Semantic search | query, limit?, project?, types?, tags? | Memory[] with scores |
| `get_memory` | Retrieve by ID | id | Memory |
| `update_memory` | Modify existing | id, updates | Memory |
| `forget` | Delete memory | id | success |
| `list_memories` | Browse with filters | limit?, type?, project?, sort? | Memory[] |
| `memory_stats` | View statistics | - | { total, by_type, by_project, by_importance } |

#### **Autonomous Tools** (9 tools) - `autonomous-tools.ts`

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `prime` | CNS activation - load context | **FIRST ACTION** at session start |
| `align` | Load topic-specific context | When switching topics |
| `synthesize` | Extract memories from text | At session end, after long discussions |
| `conclude` | Summarize session | At session end |
| `reflect` | Analyze own response for insights | After significant responses |
| `assimilate` | Merge new info with existing | When learning conflicts with existing knowledge |
| `analyze_turn` | Analyze conversation turn | Real-time during conversation |
| `analyze_conversation` | Full conversation analysis | Post-conversation review |
| `detect_intent` | Find implicit memory triggers | Real-time trigger detection |

#### **Session Tools** (2 tools) - `session-tools.ts`

| Tool | Purpose |
|------|---------|
| `start_session` | Begin tracked session with optional project |
| `end_session` | End session, optionally generate summary |

#### **Project Tools** (2 tools) - `project-tools.ts`

| Tool | Purpose |
|------|---------|
| `set_project` | Set current project context with description/tech_stack |
| `list_projects` | List all projects |

#### **Utility Tools** (4 tools) - `utility-tools.ts`

| Tool | Purpose |
|------|---------|
| `merge_memories` | Manually merge multiple memories |
| `find_similar` | Find similar memories to given content |
| `memory_types` | List all memory types with descriptions |
| `soul_status` | System health check |

#### **Shadow Tools** (4 tools) - `shadow-tools.ts`

| Tool | Purpose |
|------|---------|
| `log_activity` | Record a single activity (file read/write, search, command) |
| `batch_log_activities` | Record multiple activities at once (efficient batching) |
| `shadow_status` | View shadow log status and promotion candidates |
| `promote_shadow` | Manually promote shadow to long-term memory |

#### **Introspect Tools** (1 tool) - `introspect-tools.ts`

| Tool | Purpose |
|------|---------|
| `introspect` | Metacognition - inspect own capabilities |

#### **LLM Tools** (2 tools) - `llm-tools.ts`

| Tool | Purpose |
|------|---------|
| `configure_llm` | Configure LLM for dream state |
| `llm_status` | Check LLM availability |

#### **Graph Tools** (4 tools) - `graph-tools.ts`

| Tool | Purpose |
|------|---------|
| `graph_analysis` | Analyze memory graph (centrality, clusters) |
| `propose_links` | Suggest new links between memories |
| `apply_link` | Create explicit link between memories |
| `get_memory_links` | Get all links for a memory |

#### **Policy Tools** (3 tools) - `policy-tools.ts`

| Tool | Purpose |
|------|---------|
| `policy_status` | View autonomy policy status |
| `assign_project` | Assign memory to project |
| `bulk_assign_projects` | Bulk project assignment |

#### **Dream Tools** (7 tools) - `dream-tools.ts`

| Tool | Purpose |
|------|---------|
| `run_dream` | Execute dream cycle (consolidate, decay, prune) |
| `detect_contradictions` | Find conflicting memories |
| `find_consolidation_candidates` | Find similar memories to merge |
| `review_contradiction` | Interactive contradiction review |
| `resolve_contradiction` | Resolve detected contradiction |
| `review_consolidation` | Interactive consolidation review |
| `apply_consolidation` | Execute consolidation merge |

---

## Memory Lifecycle

### **Birth → Life → Evolution → Death**

```
┌─────────────────────────────────────────────────────────────┐
│  1. BIRTH                                                    │
│  - User saves explicitly (remember tool)                    │
│  - Auto-detected from conversation                          │
│  - Promoted from shadow log                                 │
│  - Created by dream consolidation                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ACTIVE LIFE                                              │
│  - Semantic search retrieval                                │
│  - Access count increments                                  │
│  - Importance boosted on access                             │
│  - Links created to/from other memories                     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  3. EVOLUTION                                                │
│  - New information arrives                                  │
│  - Belief supersession (valid_until set)                    │
│  - Contradiction detected → marked for review               │
│  - Consolidation with similar memories                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4. DECAY                                                    │
│  - Importance decreases over time (half-life: 30 days)      │
│  - Unless accessed (resets decay)                           │
│  - Foundational memories NEVER decay                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  5. DEATH (Not deletion - transformation)                   │
│  - Superseded by newer memory (kept as historical)          │
│  - Consolidated into merged memory (originals archived)     │
│  - Pruned to archive (low importance, no access)            │
│  - NEVER truly deleted - audit trail preserved              │
└─────────────────────────────────────────────────────────────┘
```

### **Memory Types & Characteristics**

| Type | Decay? | Typical Importance | Example |
|------|--------|-------------------|---------|
| `decision` | Yes | 3-5 | "Use PostgreSQL for primary database" |
| `pattern` | Slow | 3-4 | "Name test files with .test.ts extension" |
| `learning` | Yes | 2-4 | "Bug: Redis timeout must be > 5000ms" |
| `context` | Yes | 2-3 | "Project uses microservices architecture" |
| `preference` | Slow | 2-4 | "Prefer functional style over OOP" |
| `todo` | Fast | 2-3 | "Refactor auth module next sprint" |
| `reference` | No | 2-3 | "Docs: https://postgresql.org/docs" |
| `foundational` | **NEVER** | **5** | "Core goal: Build reliable systems" |
| `summary` | Yes | 2 | "Session summary: Implemented user auth" |
| `shadow` | Auto | 2-3 | "Explored database connection pooling" |

---

## Dream State Operations

### Purpose

The **dream state** is unconscious background processing that:
1. **Consolidates** redundant memories
2. **Detects** contradictions
3. **Applies** memory decay
4. **Prunes** low-value memories
5. **Creates** semantic links

### Trigger Mechanisms

1. **Manual**: `run_dream` tool call
2. **CLI Daemon**: `node dist/cli.js daemon` (scheduled background)
3. **Post-session**: Optionally trigger on `end_session`

### Dream Cycle Phases

#### **Phase 1: Consolidation**

```
Goal: Merge similar memories to reduce redundancy

1. Find candidates:
   - Compute pairwise embeddings similarity
   - Threshold: 0.85 (very similar)
   - Same type preferred

2. LLM Judgment (optional):
   - Prompt: "Should these merge? If yes, synthesize."
   - Response: { shouldMerge, mergedContent, mergedTags, importance }

3. Execute merge:
   - Create new memory with merged content
   - Mark originals as superseded
   - Transfer all links to merged memory
   - Preserve provenance (source="llm_consolidated")
```

#### **Phase 2: Contradiction Detection**

```
Goal: Find conflicting beliefs

1. Semantic conflicts:
   - Find memories with high similarity but opposite sentiment
   - Example: "Use MongoDB" vs "Avoid MongoDB"

2. Temporal conflicts:
   - Same decision made twice with different outcomes
   - Example: "Use Redis for cache" (2025-01) vs "Use Memcached" (2025-12)

3. LLM Judgment:
   - Prompt: "Are these contradictory? How to resolve?"
   - Response: { isRealConflict, conflictType, resolution, reasoning }

4. Actions:
   - Flag for human review (review_contradiction tool)
   - Auto-resolve if temporal supersession (newer wins)
   - Keep both if context-dependent
```

#### **Phase 3: Memory Decay**

```
Goal: Reduce importance of stale memories

Formula: importance(t) = importance_0 * (1/2)^(days_since_access / half_life)

half_life = 30 days (configurable)

Exceptions:
- Foundational memories: NEVER decay
- Recently accessed: Decay timer resets
- High importance (4-5): Slower decay

Result:
- Old, unaccessed memories fade to background
- Active memories stay prominent
```

#### **Phase 4: Pruning**

```
Goal: Archive truly obsolete memories

Criteria for pruning:
- importance < 1.0 (decayed significantly)
- access_count = 0 or last_accessed > 6 months
- NOT foundational
- NOT linked from other active memories

Action:
- Mark as archived (not deleted)
- Remove from active index
- Preserve in audit log
```

#### **Phase 5: Link Discovery**

```
Goal: Create semantic connections between memories

1. Find related pairs:
   - Cosine similarity > 0.6 (moderately related)
   - Cross-cluster links preferred (bridge concepts)

2. Determine link type:
   - "supports": Evidence relationship
   - "extends": Elaboration
   - "contradicts": Conflict
   - "implements": Abstraction → concrete

3. Create bidirectional links with reasons
```

### Dream Report Output

```json
{
  "started_at": "2026-02-02T10:00:00Z",
  "completed_at": "2026-02-02T10:05:23Z",
  "operations": ["consolidate", "contradiction", "decay"],
  "memories_processed": 302,
  "consolidations": 5,
  "contradictions_found": [
    {
      "memory_a": "mem_123",
      "memory_b": "mem_456",
      "conflict_type": "temporal",
      "explanation": "Database choice changed from MySQL to PostgreSQL"
    }
  ],
  "memories_decayed": 47,
  "memories_pruned": 0,
  "links_created": 12,
  "summaries_created": []
}
```

---

## Future Implementation Roadmap

### **Phase 1: Foundation** ✅ (Completed)

- [x] Core memory operations (remember, recall, forget)
- [x] Semantic search with embeddings
- [x] Auto-detection (type, tags, importance)
- [x] Session tracking
- [x] Project isolation
- [x] Dream state consolidation
- [x] Shadow log (ephemeral working memory)
- [x] Graph enrichment with semantic links
- [x] Temporal reasoning (valid_from, supersedes)
- [x] Modular tool architecture

### **Phase 2: Autonomy & Intelligence** 🚧 (In Progress)

- [ ] **Walker Agents**: Autonomous background agents that:
  - Propose links between memories
  - Detect patterns across sessions
  - Suggest consolidations
  - Require human approval (graduated autonomy)
  - Use proposal/review loop pattern

- [ ] **Policy Engine**: Trust-based autonomy
  - Track agent success/failure
  - Graduated trust levels
  - Auto-approve after N successful proposals
  - Human override always available

- [ ] **Preference Inference**: Learn from behavior
  - Track tool usage patterns
  - Detect implicit preferences
  - Auto-save without explicit "remember"

### **Phase 3: Multi-Instance Sync** 📅 (Planned)

**Goal**: Share soul across multiple Claude instances

- [ ] **Instance Registration**:
  - Discover active Claude instances on network
  - Track which instance is handling what project
  - Session handoff protocol

- [ ] **HTTP Transport**:
  - MCP-over-HTTP mode for remote access
  - Authentication & encryption
  - Real-time sync via WebSocket

- [ ] **Conflict Resolution**:
  - CRDT-style merge for concurrent edits
  - Last-write-wins for simple conflicts
  - Vector clock for causality tracking

### **Phase 4: Advanced Reasoning** 📅 (Future)

- [ ] **Temporal Queries**: "What did we know about X in June 2025?"
  - Query memories as-of a specific date
  - Use `valid_from` / `valid_until` for time travel
  - Reconstruct belief state at any point

- [ ] **Relationship Context**: Remember people & teams
  - Track collaborators, stakeholders
  - Remember preferences, communication styles
  - Project <-> people associations

- [ ] **Causal Reasoning**: Why did we decide X?
  - Track decision dependencies
  - Reconstruct reasoning chains
  - "If we change X, what else is affected?"

- [ ] **Proactive Suggestions**:
  - "You're working on auth, remember we decided..."
  - "This pattern contradicts our convention..."
  - "Similar problem solved in project Y..."

### **Phase 5: Ecosystem Integration** 📅 (Vision)

- [ ] **Multi-Modal Memory**:
  - Store images, diagrams, screenshots
  - Audio snippets from meetings
  - Code diffs as first-class memories

- [ ] **External Ingest**:
  - Email integration (summarize threads)
  - Slack/Discord channels
  - GitHub issues/PRs
  - Meeting transcripts

- [ ] **Collaborative Souls**:
  - Team-shared memories
  - Personal vs team scope
  - Permission system for shared memories

---

## How to Extend the System

### **Adding a New Tool**

1. Choose the appropriate module in `src/tools/` (or create new one)
2. Register tool in module's `registerXxxTools()` function:

```typescript
// src/tools/my-new-tools.ts
export function registerMyNewTools(server: McpServer): void {
  server.tool(
    "my_new_tool",
    {
      param1: z.string().describe("Description"),
      param2: z.number().optional(),
    },
    async ({ param1, param2 }) => {
      // Implementation
      return { result: "success" };
    }
  );
}
```

3. Export in `src/tools/index.ts`:
```typescript
export { registerMyNewTools } from "./my-new-tools.js";
```

4. Register in `src/index.ts`:
```typescript
import { registerMyNewTools } from "./tools/index.js";
registerMyNewTools(server);
```

5. Add tests in `tests/unit/my-new-tools.test.ts`

### **Adding a New Memory Type**

1. Update `src/types.ts`:
```typescript
export type MemoryType =
  | "decision"
  | "pattern"
  | "my_new_type"; // Add here
```

2. Add detection logic in `src/intelligence.ts`:
```typescript
export function detectMemoryType(content: string): MemoryType {
  const lower = content.toLowerCase();

  // My new type indicators
  if (/\b(keyword1|keyword2)\b/.test(lower)) {
    return "my_new_type";
  }

  // ... existing logic
}
```

3. Update `MEMORY_TYPE_DESCRIPTIONS` in `src/types.ts`

### **Adding a New Dream Operation**

1. Add operation to `src/types.ts`:
```typescript
export type DreamOperation =
  | "consolidate"
  | "my_new_operation"; // Add here
```

2. Implement in `src/dream.ts`:
```typescript
async function performMyNewOperation(
  memories: Memory[],
  dryRun: boolean
): Promise<{ processed: number; /* ... */ }> {
  // Implementation
}
```

3. Add to `runDream()` operation switch

4. Add CLI command in `src/cli.ts` if needed

### **Adding a New LLM Provider**

1. Implement provider class in `src/llm.ts`:
```typescript
export class MyNewProvider implements LLMProvider {
  name = "mynew";

  async isAvailable(): Promise<boolean> { /* ... */ }
  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> { /* ... */ }
}
```

2. Add to `getLLMProvider()` factory switch

3. Update `LLMConfig` type in `src/config.ts`

4. Document in README

---

## Testing Strategy

### **Test Pyramid**

```
           ┌──────────────────┐
           │   E2E Tests (4)   │  ← Full memory flow
           └────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │ Integration (10)   │  ← DB, MCP, tools
          └─────────┬──────────┘
                    │
        ┌───────────▼───────────┐
        │   Unit Tests (400+)   │  ← Core logic
        └───────────────────────┘
```

### **Test Organization**

- `tests/unit/` - Pure functions, isolated modules
- `tests/integration/` - DB operations, MCP tools
- `tests/e2e/` - Full user workflows
- `tests/contracts/` - API contract validation
- `tests/property/` - Property-based testing (fast-check)
- `tests/benchmarks/` - Performance benchmarks

### **Running Tests**

```bash
# All tests
npm test

# Specific suite
npm test -- tests/unit/dream.test.ts

# Watch mode
npm test -- --watch

# Benchmarks
npm test -- tests/benchmarks/

# Build validation
npm run build && npm test
```

---

## Configuration

### **Config File**: `~/.claude-memory/config.json`

```json
{
  "chroma_host": "localhost",
  "chroma_port": 8000,
  "embedding_model": "Xenova/all-MiniLM-L6-v2",

  "default_importance": 3,
  "max_context_memories": 10,
  "context_relevance_threshold": 0.3,

  "enable_memory_decay": true,
  "decay_half_life_days": 30,

  "shadow_enabled": true,
  "shadow_token_threshold": 500,
  "shadow_time_threshold_min": 30,

  "dream_use_llm": false,
  "llm": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "deepseek-coder:6.7b",
    "temperature": 0.3
  },

  "current_project": "soul-mcp",
  "projects": {
    "soul-mcp": {
      "description": "Claude memory system",
      "tech_stack": ["TypeScript", "ChromaDB", "MCP"]
    }
  }
}
```

### **Environment-Specific Config**

- Development: Local Ollama, verbose logging
- Production: Remote LLM, silent consolidation
- Testing: Mock ChromaDB, deterministic embeddings

---

## Performance Characteristics

### **Benchmarks** (on typical hardware)

| Operation | Latency | Notes |
|-----------|---------|-------|
| Single embedding | ~800ms | First call (model load) |
| Single embedding | ~30ms | Subsequent calls |
| Batch embeddings (10) | ~200ms | ~20ms per item |
| ChromaDB search (50 docs) | ~25ms | Vector similarity |
| Save memory | ~100-150ms | Embed + store |
| Trigger detection | ~3ms | Regex-based |
| Intelligence stack | ~2ms | Type/tags/importance |
| Conversation analysis | ~2ms | Extract insights |

### **Scalability Limits**

- **Memories**: Tested with 500+ memories, linear scaling
- **Embeddings**: ChromaDB handles 100K+ vectors efficiently
- **Shadow log**: Max 20 concurrent shadows (configurable)
- **Dream cycle**: Processes 300 memories in ~5 seconds
- **Consolidation**: O(n²) similarity computation (batch in groups of 100)

---

## Troubleshooting

### **Common Issues**

1. **ChromaDB not running**:
   ```bash
   chroma run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data
   ```

2. **Embedding model download fails**:
   - First run downloads ~100MB model from Hugging Face
   - Requires internet connection
   - Cached locally after first download

3. **LLM dream state not working**:
   - Check `llm_status` tool
   - Verify Ollama is running: `curl http://localhost:11434`
   - Model must be pulled: `ollama pull deepseek-coder:6.7b`

4. **Tests failing**:
   - Ensure ChromaDB is running (integration tests need it)
   - Check Node version (requires 18+)
   - Clear dist: `rm -rf dist && npm run build`

---

## Tool Consolidation (v2.0)

### Unified Tool Interfaces (2026-02-03)

A major consolidation effort reduced tool overlap and improved usability:

**3 New Unified Tools:**
- **`consolidate_memories`** - Single interface for all consolidation workflows (direct/interactive/auto)
- **`handle_contradictions`** - Unified contradiction handling (detect/interactive/auto)
- **`system_status`** - Comprehensive system dashboard with section filtering

**Benefits:**
- Reduced functional overlap from 40% to minimal
- Consistent parameter naming ("similarity" instead of varied names)
- Clear workflow selection via mode parameters
- 100% backward compatible (old tools preserved)

**See:** [TOOL-CONSOLIDATION.md](./TOOL-CONSOLIDATION.md) for complete migration guide and usage examples.

---

## Recent Refactoring (2026-02-02)

### Code Quality Improvements (Phases 1-7)

A comprehensive refactoring was completed to improve code maintainability, reliability, and testability:

#### **Phase 1: Fix Immediate Bugs**
- Removed duplicate `consciousReviewState` definition in dream-tools.ts
- Added error handling to graph-tools.ts, policy-tools.ts, session-tools.ts
- Enhanced error logging in bulk operations

#### **Phase 2: Centralize Deduplication Logic**
- Created `src/dedupe.ts` with named threshold constants:
  - `STRICT: 0.9` - for explicit saving (remember)
  - `STANDARD: 0.85` - for automatic operations (conclude, synthesize)
  - `LOOSE: 0.7` - for find_similar queries
  - `AUTOMATIC: 0.8` - for general use
- Replaced scattered thresholds across 6+ files with `checkDuplicates()` function
- Improved consistency and maintainability

#### **Phase 3: Extract Search Abstraction**
- Created `src/search-service.ts` for centralized search logic
- Unified project fallback: uses `current_project` when not specified
- Added `searchWithContext()`, `searchCurrentProject()`, `searchAllProjects()` helpers
- Eliminated 20+ duplicate parameter normalizations across tools

#### **Phase 4: Unified Error Handling**
- Created `src/tools/error-handler.ts` with standard patterns
- `toolSafeWrapper()` - catches errors and returns user-friendly responses
- `withRetry()` - exponential backoff for transient failures
- `errorResponse()` - standardized error formatting

#### **Phase 5: Extract Reporting Utilities**
- Created `src/tools/formatters.ts` with shared formatting functions
- Headers, tables, progress bars, dividers, truncation
- Consistent output formatting across all tools
- Reduced code duplication in tool responses

#### **Phase 6: Fix State Management Issues**
- Created `src/tools/state.ts` for session-scoped state management
- Replaced global `consciousReviewState` with `getReviewSession(sessionId)`
- Prevents state leaks between concurrent sessions
- Automatic stale session cleanup (10-minute interval)
- Supports multi-user/multi-session environments

#### **Phase 7: Testing and Documentation**
- Added 97 comprehensive unit tests (506 → 603 total)
- 100% coverage for new utility modules:
  - `tests/unit/dedupe.test.ts` - deduplication logic
  - `tests/unit/search-service.test.ts` - search abstractions
  - `tests/unit/formatters.test.ts` - formatting utilities
  - `tests/unit/error-handler.test.ts` - error handling
  - `tests/unit/state.test.ts` - session management
- All tests passing: 603/603 ✓

#### **Benefits**
- **Better maintainability**: Centralized utilities reduce duplication
- **Improved reliability**: Consistent error handling prevents crashes
- **Higher testability**: Modular architecture enables unit testing
- **Scalability**: Session-scoped state supports concurrent usage
- **Backward compatible**: No breaking changes to existing functionality

---

## Summary

**Soul-MCP** is a cognitive architecture for Claude that provides:

1. **Persistent memory** across sessions with semantic search
2. **Auto-detection** of insights from conversations
3. **Shadow log** for ephemeral working memory
4. **Dream states** for background consolidation
5. **Graph enrichment** with semantic links
6. **Temporal reasoning** for belief evolution
7. **Modular tool architecture** for extensibility

The system is production-ready with 603 passing tests and supports local-first operation with optional LLM enhancement.

**Next steps**: Walker agents, multi-instance sync, temporal queries.

---

**Maintained by**: CJ
**Repository**: https://github.com/yourusername/soul-mcp
**License**: MIT
**Last Updated**: 2026-02-02
