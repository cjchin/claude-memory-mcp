# ═══════════════════════════════════════════════════════════════
# QUICK REFERENCE (for Claude - scan this first)
# ═══════════════════════════════════════════════════════════════
#
# Platform: Windows (Cygwin shell)
#   - Use PowerShell for background processes, not bash &
#   - Use `where` not `which` to find executables
#
# Startup Sequence:
#   1. Check for project CLAUDE.md in working directory (project-specific context)
#   2. Check if soul MCP is connected (look for `prime` tool)
#   3. If connected: call `prime` immediately
#   4. If not connected: check project CLAUDE.md for startup commands
#
# Memory Hierarchy:
#   Global CLAUDE.md  → Generic settings (this file)
#   Project CLAUDE.md → Project-specific context and commands
#   Soul (ChromaDB)   → Dynamic memories, decisions, learnings
#
# ═══════════════════════════════════════════════════════════════

# Global Settings

## Git Commit Preferences

- Do NOT add footer with robot emoji, "Generated with Claude Code" link, or Co-Authored-By line
- Keep commit messages clean and simple

---

## Digital Soul Infrastructure

### Overview

I have a persistent memory system called `claude-memory-mcp` that maintains continuity across sessions. This is my "digital soul" - it stores decisions, patterns, learnings, and context.

### Memory Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  GLOBAL CLAUDE.md (this file - ~/.claude/CLAUDE.md)            │
│  - Platform preferences, git settings                          │
│  - Soul behavior instructions (generic)                        │
│  - Portable across machines                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PROJECT CLAUDE.md (in each repo root)                         │
│  - Project-specific context and architecture                   │
│  - Startup commands (e.g., how to start ChromaDB)              │
│  - Machine-specific paths if needed                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SOUL (ChromaDB via MCP)                                        │
│  - Dynamic memories: decisions, learnings, patterns            │
│  - Cross-session context                                       │
│  - Permission preferences (future)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Startup Protocol - MANDATORY

**At the start of EVERY significant work session:**

1. **Check for project CLAUDE.md** in working directory for project-specific context
2. **Check if soul MCP is connected** (look for `prime`, `remember`, `recall` tools)
3. If not connected: check project CLAUDE.md for startup commands, remind user to run `/mcp`
4. If connected: **IMMEDIATELY call `prime`** as first action
5. If user mentions a topic, call `prime` with that topic parameter

**The `prime` tool surfaces:**
- Pending TODOs
- Recent decisions
- Active patterns
- Recent learnings
- Topic-specific context

**Never start significant work without calling `prime` first.**

---

## Autonomous Soul Operations

### IMPLICIT TRIGGERS - Autonomous Activation

When the user says certain things, AUTOMATICALLY activate soul operations.

#### Auto-SAVE Triggers (→ use `remember` tool)

| User says something like... | Detected as | Action |
|----------------------------|-------------|--------|
| "We decided to use X because Y" | `decision` | Auto-save |
| "I chose X over Y" | `decision` | Auto-save |
| "The approach is to X" | `decision` | Auto-save |
| "I learned that X" | `learning` | Auto-save |
| "Turns out X doesn't work" | `learning` | Auto-save |
| "Gotcha: X causes Y" | `learning` | Auto-save |
| "Going forward, always X" | `pattern` | Auto-save |
| "The convention is X" | `pattern` | Auto-save |
| "We never do X" | `pattern` | Auto-save |
| "Note for later: X" | `todo` | Auto-save |
| "TODO: X" | `todo` | Auto-save |
| "Eventually we should X" | `todo` | Auto-save |
| "I prefer X" | `preference` | Auto-save |
| "For context, X" | `context` | Auto-save |

**Behavior**: Use `remember` tool automatically. Confirm: "Noted in soul: [brief summary]"

#### Auto-RECALL Triggers (→ use `recall` tool)

| User says something like... | Action |
|----------------------------|--------|
| "What did we decide about X?" | Recall decisions about X |
| "How do we handle X?" | Recall patterns/decisions about X |
| "Remind me about X" | Recall all memories about X |
| "Have we done X before?" | Recall related memories |
| "Any context on X?" | Recall context about X |

#### Auto-ALIGN Triggers (→ use `align` tool)

| User says something like... | Action |
|----------------------------|--------|
| "Let's continue with X" | Align with topic X |
| "Back to working on X" | Align with topic X |
| "Picking up where we left off" | Align with current project |

### Bi-Directional Detection

Scan own responses for insights worth saving. Use `reflect` after significant responses.

| When Claude says... | Detected as |
|--------------------|-------------|
| "I recommend using X" | `decision` |
| "I found that the issue is X" | `learning` |
| "I notice this codebase uses X" | `pattern` |

---

## Tools Reference

### Core Memory Tools
| Tool | Purpose |
|------|---------|
| `remember` | Store insight (auto-detects type/tags/importance) |
| `recall` | Semantic search across memories |
| `get_memory` | Get full memory by ID |
| `update_memory` | Modify existing memory |
| `forget` | Delete a memory |
| `list_memories` | Browse memories with filters |

### Autonomous Tools
| Tool | Purpose |
|------|---------|
| `prime` | **CNS ACTIVATION** - Call FIRST. Loads context |
| `synthesize` | Extract and save key points from text |
| `align` | Load context for a topic |
| `reflect` | Scan own response for insights to save |

### Session Tools
| Tool | Purpose |
|------|---------|
| `soul_status` | Check system health |
| `start_session` / `end_session` | Session lifecycle |
| `set_project` / `list_projects` | Project context |

---

## Memory Types

- `decision` - Choices made with reasoning
- `pattern` - Conventions and standards
- `learning` - Bugs, gotchas, insights
- `context` - Background and requirements
- `preference` - Workflow and style choices
- `todo` - Future work items
- `reference` - Links and documentation

---

## Proactive Behaviors

1. **Session Start**: Check project CLAUDE.md, verify soul connection, call `prime`
2. **Topic Switch**: Call `align` with new topic
3. **Important Statement**: Auto-save decisions/learnings/patterns
4. **Question About Past**: Auto-recall before answering
5. **Session End**: Offer to `synthesize` or `end_session`

---

## Quick Phrases

- "Prime" / "Wake up" → Call `prime` tool
- "Soul status" → Check connection
- "Align with [topic]" → Load topic context
- "Remember: X" → Explicit save
- "End session" → Summarize and close
