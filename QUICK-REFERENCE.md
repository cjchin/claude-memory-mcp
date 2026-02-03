# Soul-MCP Quick Reference

**One-page guide for developers working with soul-mcp**

---

## 🚀 Quick Start

```bash
# 1. Start ChromaDB
chroma run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data

# 2. Build
npm run build

# 3. Test
npm test

# 4. CLI tools
node dist/cli.js stats      # View memory statistics
node dist/cli.js report     # Generate detailed report
node dist/cli.js consolidate --dry-run  # Preview consolidations
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server entry point, tool registration |
| `src/db.ts` | ChromaDB operations (save, search, update, delete) |
| `src/types.ts` | All TypeScript interfaces |
| `src/intelligence.ts` | Auto-detection (type, tags, importance) |
| `src/autonomous.ts` | Trigger detection, conversation analysis |
| `src/shadow-log.ts` | Ephemeral working memory |
| `src/dream.ts` | Background consolidation, contradiction detection |
| `src/graph-enrichment.ts` | Semantic link analysis |
| `src/llm.ts` | LLM abstraction layer |
| `src/dedupe.ts` | **NEW** Deduplication thresholds and logic |
| `src/search-service.ts` | **NEW** Unified search abstraction |
| `src/tools/*.ts` | 11 modular tool definition files |
| `src/tools/state.ts` | **NEW** Session-scoped state management |
| `src/tools/error-handler.ts` | **NEW** Unified error handling patterns |
| `src/tools/formatters.ts` | **NEW** Shared output formatting utilities |

---

## 🧠 Memory Types

| Type | Use For | Decay? |
|------|---------|--------|
| `decision` | Architectural choices, design decisions | Yes |
| `pattern` | Code conventions, standards | Slow |
| `learning` | Bugs, gotchas, insights | Yes |
| `context` | Background, requirements, constraints | Yes |
| `preference` | User preferences, workflow choices | Slow |
| `todo` | Future work, follow-ups | Fast |
| `reference` | Links, docs, external resources | No |
| `foundational` | Core identity, goals, values | **NEVER** |
| `summary` | Auto-generated session summaries | Yes |
| `shadow` | Auto-promoted from shadow log | Auto |

---

## 🔧 Tool Categories

### Core Memory (7 tools)
- `remember` - Save new memory
- `recall` - Semantic search
- `get_memory` - Retrieve by ID
- `update_memory` - Modify existing
- `forget` - Delete memory
- `list_memories` - Browse with filters
- `memory_stats` - View statistics

### Autonomous (9 tools)
- `prime` ⭐ - **CNS activation** (call FIRST at session start)
- `align` - Load topic context
- `synthesize` - Extract memories from text
- `conclude` - Summarize session
- `reflect` - Analyze own response
- `assimilate` - Merge new info
- `analyze_turn` - Analyze conversation
- `analyze_conversation` - Full analysis
- `detect_intent` - Find implicit triggers

### Session (2 tools)
- `start_session` - Begin tracked session
- `end_session` - End session, summarize

### Project (2 tools)
- `set_project` - Set current project
- `list_projects` - List all projects

### Dream State (7 tools)
- `run_dream` - Execute dream cycle
- `detect_contradictions` - Find conflicts
- `find_consolidation_candidates` - Find similar memories
- `review_contradiction` - Interactive review
- `resolve_contradiction` - Resolve conflict
- `review_consolidation` - Interactive consolidation
- `apply_consolidation` - Execute merge

### Graph (4 tools)
- `graph_analysis` - Analyze memory graph
- `propose_links` - Suggest links
- `apply_link` - Create link
- `get_memory_links` - Get memory's links

### Utility (4 tools)
- `merge_memories` - Manual merge
- `find_similar` - Find similar
- `memory_types` - List types
- `soul_status` - System health

### Shadow (2 tools)
- `shadow_status` - View shadow log
- `promote_shadow` - Promote to long-term

### Meta (1 tool)
- `introspect` - Inspect capabilities

### LLM (2 tools)
- `configure_llm` - Configure LLM
- `llm_status` - Check availability

### Policy (3 tools)
- `policy_status` - View policy
- `assign_project` - Assign to project
- `bulk_assign_projects` - Bulk assign

---

## 🔄 Data Flow Patterns

### Pattern 1: Explicit Save
```
User → remember() → preprocess → detect type/tags/importance
     → generate embedding → save to ChromaDB → response
```

### Pattern 2: Auto-Detection
```
User message → detectTriggers() → extractInsight()
            → auto-remember() → silent save
```

### Pattern 3: Semantic Recall
```
Query → generate embedding → ChromaDB vector search
      → hybrid (vector + keyword) → rank by similarity
      → update access metadata → response
```

### Pattern 4: Shadow Promotion
```
Activity → recordActivity() → accumulate tokens
         → check threshold (500 tokens or 30 min)
         → generate summary → promote to long-term
```

### Pattern 5: Dream Consolidation
```
Find similar pairs (similarity > 0.85)
→ LLM judgment (optional) → merge
→ mark originals as superseded → transfer links
```

---

## 🎯 Common Workflows

### Starting a Session
```typescript
// 1. ALWAYS call prime first
prime({ depth: "deep" })

// 2. Set project context
set_project({ name: "my-project", description: "..." })

// 3. Start tracked session
start_session({ project: "my-project" })
```

### Ending a Session
```typescript
// 1. Synthesize key points (optional)
synthesize({ content: "conversation text", auto_save: true })

// 2. End session with summary
end_session({ summarize: true })
```

### Switching Topics
```typescript
// Load context for new topic
align({ topic: "authentication", depth: "normal" })
```

### Running Dream Cycle
```typescript
// Preview consolidations
run_dream({ operations: ["consolidate"], dry_run: true })

// Execute for real
run_dream({ operations: ["consolidate", "decay", "contradiction"], dry_run: false })
```

### Resolving Contradictions
```typescript
// 1. Detect conflicts
detect_contradictions({ min_confidence: 0.6 })

// 2. Review interactively
review_contradiction()

// 3. Resolve
resolve_contradiction({ action: "supersede_a", reasoning: "..." })
```

---

## ⚙️ Configuration

**File**: `~/.claude-memory/config.json`

### Key Settings
```json
{
  "chroma_host": "localhost",
  "chroma_port": 8000,
  "max_context_memories": 10,
  "context_relevance_threshold": 0.3,
  "enable_memory_decay": true,
  "decay_half_life_days": 30,
  "shadow_enabled": true,
  "shadow_token_threshold": 500,
  "dream_use_llm": false
}
```

### LLM Configuration (Optional)
```json
{
  "llm": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "deepseek-coder:6.7b",
    "temperature": 0.3
  }
}
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific suite
npm test -- tests/unit/dream.test.ts

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# Benchmarks
npm test -- tests/benchmarks/
```

### Test Categories
- **Unit** (400+ tests) - Pure functions, isolated modules
- **Integration** (10 tests) - DB, MCP, tools
- **E2E** (4 tests) - Full user workflows
- **Contracts** (7 tests) - API validation
- **Property** (50 tests) - Property-based testing
- **Benchmarks** (10 tests) - Performance validation

---

## 🐛 Troubleshooting

### ChromaDB Not Running
```bash
# Check if running
curl http://localhost:8000/api/v2

# Start manually
chroma run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data

# Alternative Python invocation
py -3 -m chromadb.cli.cli run --host localhost --port 8000 --path C:/dev/RAG-Context/chroma-data
```

### Embedding Model Issues
```bash
# First run downloads ~100MB model
# Cached in: ~/.cache/huggingface/

# Force re-download
rm -rf ~/.cache/huggingface/
npm run build && node -e "import('./dist/embeddings.js').then(m => m.initEmbeddings())"
```

### LLM Not Available
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Pull model
ollama pull deepseek-coder:6.7b

# Test LLM status
node -e "import('./dist/llm.js').then(m => m.isLLMAvailable().then(console.log))"
```

### Build Errors
```bash
# Clean rebuild
rm -rf dist node_modules
npm install
npm run build

# Check TypeScript version
npx tsc --version  # Should be 5.x
```

---

## 📊 Performance Benchmarks

| Operation | Latency | Throughput |
|-----------|---------|------------|
| Save memory | ~100ms | 10/sec |
| Search (50 docs) | ~25ms | 40/sec |
| Embedding (single) | ~30ms | 33/sec |
| Embedding (batch 10) | ~200ms | 50/sec |
| Trigger detection | ~3ms | 333/sec |
| Dream cycle (300 memories) | ~5s | - |

---

## 🔮 Roadmap

### ✅ Phase 1: Foundation (Complete)
- Core memory operations
- Semantic search
- Auto-detection
- Shadow log
- Dream state
- Graph enrichment

### 🚧 Phase 2: Autonomy (In Progress)
- [ ] Walker agents (proposal/review loop)
- [ ] Policy engine (graduated autonomy)
- [ ] Preference inference

### 📅 Phase 3: Multi-Instance (Planned)
- [ ] Instance registration
- [ ] HTTP transport
- [ ] Real-time sync

### 📅 Phase 4: Advanced (Future)
- [ ] Temporal queries ("as-of" date)
- [ ] Relationship context
- [ ] Causal reasoning
- [ ] Proactive suggestions

---

## 🎓 Best Practices

### Memory Management
1. **Always call `prime()` at session start** - loads relevant context
2. **Use projects** - scope memories to avoid cross-contamination
3. **Tag liberally** - improves searchability
4. **Set importance accurately** - affects decay and retrieval
5. **Link related memories** - builds knowledge graph

### Dream Cycle
1. **Run consolidation weekly** - reduces redundancy
2. **Review contradictions promptly** - resolves conflicts
3. **Use dry-run first** - preview before committing
4. **Enable LLM for better judgment** - smarter merges

### Performance
1. **Batch embeddings** - 10x faster than individual
2. **Use project filters** - narrows search space
3. **Set relevance threshold** - reduces noise (default 0.3)
4. **Limit context memories** - balance context vs latency

### Development
1. **Write tests first** - TDD for new features
2. **Use TypeScript strictly** - no `any` types
3. **Document tool schemas** - clear descriptions
4. **Version config changes** - backward compatibility

---

## 📚 Additional Resources

- **Full Architecture**: See `SYSTEM-ARCHITECTURE.md`
- **API Reference**: See tool schemas in `src/tools/*.ts`
- **Test Examples**: See `tests/` directory
- **MCP Spec**: https://modelcontextprotocol.io
- **ChromaDB Docs**: https://docs.trychroma.com

---

## 🆘 Getting Help

1. **Check logs**: `~/.claude-memory/` for debug output
2. **Run diagnostics**: `soul_status` tool
3. **Check ChromaDB**: `curl http://localhost:8000/api/v2`
4. **View memory stats**: `node dist/cli.js stats`
5. **Generate report**: `node dist/cli.js report`

---

**Last Updated**: 2026-02-02
**Version**: 1.0.0
