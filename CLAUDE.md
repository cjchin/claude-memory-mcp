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
