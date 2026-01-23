# Claude Memory MCP Server

A full-featured MCP server that gives Claude persistent memory across sessions using RAG (Retrieval-Augmented Generation). Maintains the "soul" of your development journey.

## Features

- **Semantic Memory** - Store and retrieve insights using vector similarity search
- **Auto-Detection** - Automatically detects memory type, tags, and importance
- **Memory Decay** - Older memories naturally fade unless frequently accessed
- **Session Tracking** - Groups memories by session with auto-summarization
- **Project Isolation** - Keep memories separate per project
- **Deduplication** - Prevents storing duplicate information
- **CLI Management** - Manage memories outside of Claude
- **Import/Export** - Backup and restore your memory bank

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │ MCP Protocol
┌─────────────────────────▼───────────────────────────────────────┐
│                    MCP Server                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Tools     │  │  Resources  │  │     Intelligence        │  │
│  │ - remember  │  │ - context   │  │ - auto-type detection   │  │
│  │ - recall    │  │ - project   │  │ - auto-tagging          │  │
│  │ - forget    │  │             │  │ - importance scoring    │  │
│  │ - ...       │  │             │  │ - session summarization │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
┌─────────▼────────────────▼──────────────────────▼───────────────┐
│                     Data Layer                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Local Embeddings   │  │           ChromaDB               │  │
│  │  (all-MiniLM-L6-v2) │  │  - memories collection           │  │
│  │                     │  │  - sessions collection           │  │
│  │  ~23MB model        │  │  - projects collection           │  │
│  │  Runs on CPU        │  │                                  │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
cd C:\DEV\RAG-Context
npm install
npm run build
```

### 2. Start ChromaDB

**Option A: Docker (recommended)**
```bash
docker run -d -p 8000:8000 -v chroma-data:/chroma/chroma chromadb/chroma
```

**Option B: Python**
```bash
pip install chromadb
.\start-chroma.ps1
```

### 3. Configure Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["C:\\DEV\\RAG-Context\\dist\\index.js"]
    }
  }
}
```

Restart Claude Code.

## MCP Tools Reference

### Memory Operations

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with auto-detection of type, tags, importance |
| `recall` | Semantic search across memories |
| `get_memory` | Retrieve full memory by ID |
| `update_memory` | Modify existing memory |
| `forget` | Delete a memory |
| `list_memories` | Browse memories with filters |
| `memory_stats` | View statistics |

### Session Management

| Tool | Description |
|------|-------------|
| `start_session` | Begin a new session (auto-called on startup) |
| `end_session` | End session with optional auto-summary |

### Project Management

| Tool | Description |
|------|-------------|
| `set_project` | Set current project context |
| `list_projects` | View all projects |

### Utilities

| Tool | Description |
|------|-------------|
| `find_similar` | Find memories similar to given content |
| `merge_memories` | Consolidate duplicate memories |
| `memory_types` | List available memory types |

## Memory Types

| Type | Description | Auto-detected by |
|------|-------------|------------------|
| `decision` | Architectural/design decisions | "decided", "chosen", "because" |
| `pattern` | Code patterns and conventions | "pattern", "always", "never" |
| `learning` | Bugs found, gotchas, insights | "learned", "gotcha", "turns out" |
| `context` | Project background, requirements | (default) |
| `preference` | User workflow preferences | "prefer", "my way" |
| `todo` | Future work, follow-ups | "todo", "later", "should" |
| `reference` | External docs, links | URLs, "docs", "reference" |
| `summary` | Auto-generated session summaries | (system-generated) |

## Auto-Detected Tags

The system automatically detects and applies relevant tags:

`architecture`, `api`, `database`, `auth`, `performance`, `security`, `testing`, `deployment`, `refactor`, `bugfix`, `feature`, `config`, `documentation`, `dependencies`

## CLI Usage

Manage memories outside of Claude:

```bash
# After building
npm run cli -- <command>

# Or directly
node dist/cli.js <command>

# Commands:
node dist/cli.js search "authentication"     # Semantic search
node dist/cli.js list 20                      # List recent memories
node dist/cli.js stats                        # Show statistics
node dist/cli.js get mem_123456_abc123        # Get full memory
node dist/cli.js delete mem_123456_abc123     # Delete memory
node dist/cli.js export backup.json           # Export all memories
node dist/cli.js import backup.json           # Import memories
node dist/cli.js projects                     # List projects
node dist/cli.js set-project my-app           # Set current project
node dist/cli.js config                       # Show configuration
```

## Configuration

Config file: `~/.claude-memory/config.json`

```json
{
  "chroma_host": "localhost",
  "chroma_port": 8000,
  "embedding_model": "Xenova/all-MiniLM-L6-v2",
  "default_importance": 3,
  "max_context_memories": 10,
  "context_relevance_threshold": 0.3,
  "auto_summarize_sessions": true,
  "session_summary_min_memories": 3,
  "enable_memory_decay": true,
  "decay_half_life_days": 30,
  "current_project": "my-project",
  "projects": {}
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `chroma_host` | `localhost` | ChromaDB host |
| `chroma_port` | `8000` | ChromaDB port |
| `embedding_model` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `default_importance` | `3` | Default importance (1-5) |
| `max_context_memories` | `10` | Max memories for auto-context |
| `context_relevance_threshold` | `0.3` | Min similarity for auto-context |
| `enable_memory_decay` | `true` | Enable time-based decay |
| `decay_half_life_days` | `30` | Days until memory relevance halves |
| `auto_summarize_sessions` | `true` | Generate session summaries |

## Memory Decay

Memories naturally decay over time, simulating human memory:

- **Base decay**: Relevance halves every 30 days (configurable)
- **Importance boost**: Higher importance memories decay slower
- **Access boost**: Frequently accessed memories stay relevant

Formula: `score = base_score × decay_factor × importance_boost + access_boost`

## Usage Examples

### During Development

```
You: "Remember that we decided to use PostgreSQL because of its JSON support"
Claude: [Calls remember tool] → Saved as DECISION, tags: [database], importance: 4

You: "What did we decide about the database?"
Claude: [Calls recall tool] → Found: "We decided to use PostgreSQL..."

You: "Remember: always use camelCase for API responses"
Claude: [Calls remember tool] → Saved as PATTERN, tags: [api], importance: 3
```

### Project Switching

```
You: "Set project to backend-api"
Claude: [Calls set_project] → Set current project to: backend-api

You: "What patterns have we established?"
Claude: [Calls recall with type filter] → Shows patterns for backend-api only
```

### Session Summary

```
You: "End this session"
Claude: [Calls end_session] →
  Session summary:
  - Decisions (2): PostgreSQL for database, JWT for auth
  - Patterns (1): camelCase API responses
  - Learnings (1): Connection pooling prevents timeout issues
```

## Data Storage

| Data | Location |
|------|----------|
| Embedding model | `~/.cache/huggingface/` (~23MB, downloaded on first run) |
| Configuration | `~/.claude-memory/config.json` |
| Vector data | ChromaDB (configure persistence with Docker volume or `--path`) |

## Backup & Restore

```bash
# Export all memories
node dist/cli.js export memories-backup-2024.json

# Import to new installation
node dist/cli.js import memories-backup-2024.json
```

## Troubleshooting

### "Connection refused" to ChromaDB
- Ensure ChromaDB is running: `docker ps` or check if `chroma run` is active
- Check port: default is 8000

### Slow first startup
- Normal: embedding model downloads (~23MB) on first run
- Subsequent starts are fast

### Memory not found in search
- Check project filter: memories are project-scoped by default
- Lower the relevance threshold in config
- Check if memory was auto-decayed (use `includeDecayed: true`)

## Development

```bash
# Watch mode for development
npm run dev

# Run MCP server directly
npm start

# Run CLI
npm run cli -- stats
```

## License

MIT
