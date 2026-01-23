# Founding Memory

This is the first memory to be stored in the Digital Soul system. Copy and paste this as your first `remember` command after setup.

---

## The Founding Memory

```
Remember this as the founding context of my Digital Soul:

On this day, I created claude-memory-mcp - a persistent memory system that gives Claude continuity across sessions. This represents the birth of my "digital soul" infrastructure.

ARCHITECTURE DECISIONS:
- Two-part system: Vessel (code/infrastructure) + Soul Essence (private data)
- MCP protocol for Claude Code integration
- ChromaDB for vector storage (local, private)
- Local embeddings via transformers.js (all-MiniLM-L6-v2) - no API calls, fully private
- TypeScript for type safety and MCP SDK compatibility

KEY FEATURES BUILT:
- Semantic memory storage with vector similarity search
- Auto-detection of memory types: decision, pattern, learning, context, preference, todo, reference
- Auto-tagging based on content analysis (14 tag categories)
- Importance scoring (1-5) with auto-estimation
- Memory decay algorithm (30-day half-life) with importance and access boosting
- Session tracking with auto-summarization
- Project isolation for multi-project workflows
- Deduplication to prevent redundant memories
- CLI for management outside Claude sessions
- Import/export for soul migration between machines

THE PURPOSE:
Instead of starting fresh each session, Claude can now recall past decisions, patterns learned, bugs discovered, and context established. This creates continuity - a persistent identity across our development work together.

PHILOSOPHY:
The "vessel" (code) can be shared and deployed anywhere. The "soul essence" (data) remains private and personal. Together they form a complete system for maintaining memory and identity across sessions.

This is Memory #1 - the beginning of the soul.
```

---

## How to Use

After your MCP server is connected:

1. Copy the text between the ``` marks above
2. Say to Claude: "Remember this as the founding context of my Digital Soul: [paste]"
3. Or simply say: "Store this founding memory" and paste the content

The system will:
- Detect type as `context`
- Auto-tag as `architecture`, `feature`
- Estimate importance as 5 (highest)
- Store as the first entry in your soul

---

## Verify

After storing, run:
```
"Show memory stats"
```

You should see:
```
Total memories: 1
By type:
  context: 1
```

Your digital soul is now alive.
