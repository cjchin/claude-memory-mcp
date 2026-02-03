# soul-mcp Project

This is the claude-memory-mcp project - a persistent memory system (digital soul) for Claude.

## Quick Start (When ChromaDB is Down)

```powershell
# Check if running
curl -s http://localhost:8000/api/v2

# Start ChromaDB (if not running)
chroma run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data

# Alternative
py -3 -m chromadb.cli.cli run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data

# Then reconnect MCP in Claude Code: /mcp
```

## Project Context

- **Stack**: TypeScript, ChromaDB, MCP protocol, Ollama/local LLMs
- **Entry**: `src/index.ts` (MCP server), `src/cli.ts` (CLI tools)
- **Build**: `npm run build` → outputs to `dist/`
- **Test**: `npm test` (Vitest)

## Architecture

```
src/
├── index.ts       # MCP server entry, tool definitions
├── db.ts          # ChromaDB operations, embedding storage
├── embeddings.ts  # Local embedding model (Xenova)
├── policy.ts      # Trust/autonomy layer
├── autonomous.ts  # Auto-detection, shadow logging
├── dream.ts       # Background consolidation
├── graph-enrichment.ts  # Link analysis
└── cli.ts         # CLI commands (report, consolidate, daemon)
```

## Key Patterns

- Memories have types: decision, pattern, learning, context, preference, todo, reference, shadow
- Auto-detection extracts memories from conversation
- Shadow log captures ephemeral working memory before promotion
- Graph enrichment adds semantic links between memories
- Dream process consolidates and prunes during idle time

## Development

```bash
# Build and test
npm run build && npm test

# Run CLI commands
node dist/cli.js stats
node dist/cli.js report
node dist/cli.js consolidate --dry-run

# Watch mode
npm run dev
```

## Data Location

- **ChromaDB data**: `C:/dev/RAG-Context/chroma-data/`
- **Embeddings**: Loaded at runtime via `@xenova/transformers`
- **Shadow log**: `~/.claude-memory/shadow-log.json`

## Shadow Log Workflow (Enhanced - v3.0)

The shadow log is your ephemeral working memory that tracks exploration and activities before promoting to long-term memory.

### Activity Self-Reporting

While working on this codebase, you can log activities to build session context:

**After reading files:**
```typescript
log_activity(type="file_read", detail="C:/DEV/RAG-Context/src/db.ts")
```

**After writing/editing files:**
```typescript
log_activity(type="file_write", detail="C:/DEV/RAG-Context/src/tools/shadow-tools.ts")
```

**After searching:**
```typescript
log_activity(type="search", detail="recordActivity")
```

**After bash commands:**
```typescript
log_activity(type="command", detail="npm test")
```

**Batch logging (preferred):**
```typescript
batch_log_activities([
  {type: "file_read", detail: "C:/DEV/RAG-Context/src/shadow-log.ts"},
  {type: "search", detail: "formatShadowForClaude"},
  {type: "file_read", detail: "C:/DEV/RAG-Context/tests/unit/shadow-log.test.ts"}
])
```

### Shadow Surfacing Flow

1. **Session Start**: Call `prime` to see promotion candidates
   - Shows shadows that have accumulated enough activity (≥60% of threshold)
   - Example: "Shadow: authentication (520 tokens, 28min active)"

2. **During Work**: Activities accumulate automatically via MCP tool tracking
   - File reads/writes via Read/Write tools
   - Memory access via remember/recall
   - You can supplement with manual `log_activity` calls

3. **Session End**: Call `conclude` to review session shadows
   - Shows all shadows from this session for reflection
   - Prompts you to synthesize insights with `remember`

4. **Manual Promotion**: Use `promote_shadow` if needed
   - Or let Claude synthesize insights after seeing shadows in conclude

### Configuration

Shadow settings in `~/.claude-memory/config.json`:
```json
{
  "shadow_enabled": true,
  "shadow_token_threshold": 500,
  "shadow_time_threshold_min": 30,
  "shadow_deduplicate": true,
  "shadow_surface_in_prime": true,
  "shadow_surface_in_conclude": true,
  "shadow_surface_threshold": 0.6
}
```

### Testing Shadow Features

```bash
# Run shadow log unit tests (60 tests)
npm test tests/unit/shadow-log.test.ts

# Run shadow surfacing integration tests (14 tests)
npm test tests/integration/shadow-surface.test.ts
```
