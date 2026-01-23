# Claude Memory MCP Server - Copilot Instructions

## Project Overview
MCP (Model Context Protocol) server providing persistent memory for Claude using RAG. Stores memories in ChromaDB with local embeddings (all-MiniLM-L6-v2 via @xenova/transformers).

**Soul Architecture**: This project implements a "living soul" system with temporal reasoning, contradiction detection, and dream states for memory reorganization. See [SOUL.md](../SOUL.md) for full architecture vision.

## Architecture

```
Claude Code → MCP Protocol → index.ts (tools/resources) → db.ts → ChromaDB
                                   ↓
                           intelligence.ts (auto-detection)
                           autonomous.ts (trigger patterns)
                           alignment.ts (bidirectional triggers)
                           dream.ts (consolidation/contradiction)
                           embeddings.ts (vector generation)
```

**Memory Layers:**
- **Conscious**: Recent working memory (sessions)
- **Long-term**: Consolidated, semantically indexed (ChromaDB)  
- **Foundational**: Core identity, goals, values - never decays

**Key Data Flow:**
1. `remember` tool receives content → `intelligence.ts` auto-detects type/tags/importance → `db.ts` embeds and stores in ChromaDB
2. `recall` tool queries → `embeddings.ts` generates query vector → `db.ts` semantic search → returns ranked memories
3. Dream cycle (CI/CD) → `dream.ts` detects contradictions, consolidates similar, applies decay

**Collections:** `claude_memories`, `claude_sessions`, `claude_projects` (all in ChromaDB)

## Development Commands
```powershell
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode compilation
npm run start      # Run MCP server (normally launched by Claude Code)
npm run cli        # CLI for memory management outside MCP
.\start-chroma.ps1 # Start ChromaDB locally (required)

# Dream state commands
npm run cli -- dream --dry-run     # Preview dream cycle changes
npm run cli -- dream full          # Run full reorganization
npm run cli -- dream contradiction # Detect conflicts only
npm run cli -- inject-founding     # Load foundational memories
```

## Code Patterns

### MCP Tool Registration ([src/index.ts](src/index.ts))
```typescript
server.tool(
  "tool_name",
  { param: z.string().describe("Description") },  // Zod schema
  async ({ param }) => {
    return { content: [{ type: "text" as const, text: "result" }] };
  }
);
```

### Memory Types ([src/types.ts](src/types.ts))
`decision` | `pattern` | `learning` | `context` | `preference` | `summary` | `todo` | `reference`
- Auto-detected by regex patterns in `intelligence.ts::detectMemoryType()`
- Each type has specific trigger words (see `detectMemoryType` function)

**Soul-Specific Types:**
- `foundational` - Core identity, goals, values (never decays, importance=5)
- `contradiction` - Detected conflict between memories
- `superseded` - Historical memory replaced by newer information

### Embedding Pattern ([src/embeddings.ts](src/embeddings.ts))
```typescript
const embedding = await embed(content);  // Returns number[] for ChromaDB
```
- Model auto-downloads to `~/.cache/huggingface/` on first use
- ~23MB, runs on CPU

### ChromaDB Metadata Conventions ([src/db.ts](src/db.ts))
- Tags stored as comma-separated string: `tags: memory.tags.join(",")`
- Arrays parsed on retrieval: `.split(",").filter(Boolean)`
- JSON metadata: `metadata_json: JSON.stringify(memory.metadata)`

## Critical Implementation Details

1. **Duplicate Detection**: `findSimilarMemories(content, 0.9)` checks before saving (90% similarity threshold)

2. **Memory Decay**: Importance decays over time based on `decay_half_life_days` config; frequently accessed memories resist decay

3. **Session Tracking**: Memories auto-associate with `getCurrentSessionId()`; sessions auto-summarize when ended

4. **Project Isolation**: `config.current_project` filters queries; set via `setProject()` or tool parameter

## Config Location
`~/.claude-memory/config.json` - ChromaDB host/port, decay settings, project contexts

## Testing

### Test Commands
```powershell
npm run test           # Run all tests (260 tests)
npm run test:watch     # Watch mode
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests (needs ChromaDB)
npm run test:e2e       # End-to-end memory lifecycle tests
npm run test:property  # Property-based tests (fast-check)
npm run test:contracts # MCP protocol contract validation
npm run test:bench     # Performance benchmarks
npm run test:coverage  # Coverage report
npm run test:mutation  # Mutation testing (Stryker)
```

### Test Structure
```
tests/
├── setup.ts              # Global setup, model preload
├── utils.ts              # Mock factories, fixtures, helpers
├── unit/
│   ├── intelligence.test.ts  # Type/tag/importance detection (32 tests)
│   ├── autonomous.test.ts    # Trigger pattern matching (58 tests)
│   ├── alignment.test.ts     # Smart alignment system (33 tests)
│   ├── dream.test.ts         # Dream cycle/contradiction (24 tests)
│   └── embeddings.test.ts    # Vector generation (16 tests)
├── integration/
│   ├── db.test.ts            # Decay/serialization logic (mocked)
│   └── chromadb.real.test.ts # Real ChromaDB operations
├── e2e/
│   └── memory-flow.e2e.test.ts  # Full remember→recall→forget cycles
├── property/
│   ├── intelligence.property.test.ts  # Property-based (20 tests)
│   └── autonomous.property.test.ts    # Property-based (30 tests)
├── contracts/
│   └── mcp.contract.test.ts  # MCP protocol validation (14 tests)
└── benchmarks/
    └── performance.bench.test.ts  # Latency measurements
```

### Smart Alignment System ([src/alignment.ts](src/alignment.ts))
Bidirectional trigger detection for automatic memory management:

```typescript
import { SmartAlignmentEngine, ConversationTracker } from './alignment.js';

const engine = new SmartAlignmentEngine({
  autoSaveEnabled: true,
  userTriggerThreshold: 0.7,
  claudeInsightThreshold: 0.75,
});

// Analyze a conversation turn
const result = engine.analyze(userMessage, claudeResponse);

// result.memoriesToCreate - memories to auto-save
// result.recallQueries - queries to execute
// result.needsAlignment - if context priming needed
// result.explanation - human-readable summary
```

### Testing Patterns Discovered

**Detection Priority (intelligence.ts):**
- `"decided"` triggers `decision` type, but `"decision"` (noun) doesn't
- `"using"` anywhere triggers `decision` detection (verb form priority)
- `"My style is..."` matches `pattern` before `preference`
- Importance decrease requires 2+ low-importance signals (-0.5 each)

**Semantic Signals (autonomous.ts):**
- `detectSemanticSignal()` returns `{ signal, reason, boost }`
- Align triggers require 0.8+ confidence threshold
- `detectClaudeInsights()` extracts recommendations/discoveries from Claude responses

**Property-Based Testing (fast-check):**
```typescript
fc.assert(
  fc.property(fc.string(), (input) => {
    const result = detectMemoryType(input);
    return validTypes.includes(result);  // Invariant check
  }),
  { numRuns: 500 }
);
```

### Integration Test Prerequisites
Real ChromaDB tests auto-skip if ChromaDB unavailable:
```powershell
.\start-chroma.ps1  # Start ChromaDB first
npm run test:integration
```

## Debugging
- Check ChromaDB: `curl http://localhost:8000/api/v1/heartbeat`
- CLI exploration: `node dist/cli.js list`, `node dist/cli.js stats`
- Export/import: `node dist/cli.js export backup.json`

## When Adding New Tools
1. Define Zod schema with `.describe()` for each parameter
2. Return `{ content: [{ type: "text" as const, text: "..." }] }` format
3. Use `config.current_project` for project-aware operations
4. Call `addMemoryToSession(id)` when creating memories
