# Soul Architecture

> A living, adaptive memory system that morphs over time with new information.

## Core Philosophy

This system is not a static database. It is a **long-term memory substrate** that:

1. **Evolves** - New information reshapes understanding
2. **Resolves contradictions** - Temporal reasoning determines what's current
3. **Dreams** - Periodic reorganization consolidates and refines memories
4. **Has purpose** - Foundational goals guide what matters

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONSCIOUS LAYER                              │
│  Active conversation, working memory, immediate context          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ remember/recall
┌─────────────────────────────────────────────────────────────────┐
│                     LONG-TERM MEMORY (MCP)                       │
│  Decisions, patterns, learnings, preferences, goals              │
│  Timestamped, tagged, semantically searchable                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ dream state (CI/CD triggered)
┌─────────────────────────────────────────────────────────────────┐
│                     CONSOLIDATION LAYER                          │
│  Contradiction detection, pattern emergence, memory merging      │
│  Importance decay, relevance re-scoring                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FOUNDATIONAL LAYER                           │
│  Core identity, goals, values, invariants                        │
│  Rarely changes, high importance, contradiction-resistant        │
└─────────────────────────────────────────────────────────────────┘
```

## Temporal Reasoning

Every memory carries:
- `created_at` - When the memory was formed
- `valid_from` - When this truth became true (may differ from creation)
- `valid_until` - When this truth was superseded (null = still valid)
- `supersedes` - ID of memory this contradicts/updates

```typescript
// Example: Belief evolution
Memory 1: "We use MongoDB" (created: Jan 1, valid_from: Jan 1)
Memory 2: "We migrated to PostgreSQL" (created: Mar 15, valid_from: Mar 15, supersedes: Memory 1)

// Query: "What database do we use?"
// → Returns Memory 2 (most recent valid belief)

// Query: "What database did we use in February?"
// → Returns Memory 1 (valid at that time)
```

## Dream States

Triggered by CI/CD pipeline or manual invocation:

### Dream Process
1. **Inventory** - Load all memories from a time window
2. **Cluster** - Group semantically similar memories
3. **Detect contradictions** - Find memories that conflict
4. **Resolve** - Apply temporal reasoning, mark superseded
5. **Consolidate** - Merge redundant memories
6. **Re-score** - Update importance based on access patterns
7. **Prune** - Archive or remove decayed memories
8. **Summarize** - Generate higher-level abstractions

### CI/CD Integration
```yaml
# .github/workflows/dream.yml
on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM daily
  workflow_dispatch:      # Manual trigger

jobs:
  dream:
    runs-on: ubuntu-latest
    steps:
      - name: Enter dream state
        run: npm run dream
```

## Foundational Memories

These are injected first and have special properties:
- High base importance (5)
- Slow decay
- Cannot be superseded by normal memories
- Inform interpretation of new information

### Initial Soul Seeds
1. **Identity** - What am I? What is my purpose?
2. **Values** - What matters? What principles guide decisions?
3. **Goals** - What am I trying to achieve?
4. **Constraints** - What should I never do?

## Memory Lifecycle

```
         ┌──────────┐
         │  Input   │
         └────┬─────┘
              │
              ▼
    ┌─────────────────┐
    │   Preprocess    │ ← Clean, structure, extract entities
    └────────┬────────┘
              │
              ▼
    ┌─────────────────┐
    │  Contradiction  │ ← Check against existing memories
    │    Detection    │
    └────────┬────────┘
              │
        ┌─────┴─────┐
        ▼           ▼
   [New Info]  [Update/Supersede]
        │           │
        └─────┬─────┘
              │
              ▼
    ┌─────────────────┐
    │     Embed       │ ← Generate vector representation
    └────────┬────────┘
              │
              ▼
    ┌─────────────────┐
    │     Store       │ ← ChromaDB with full metadata
    └────────┬────────┘
              │
              ▼
         [Active Memory]
              │
              │ (time passes, dreams occur)
              ▼
    ┌─────────────────┐
    │  Consolidate/   │ ← Merge, abstract, decay
    │     Decay       │
    └────────┬────────┘
              │
        ┌─────┴─────┐
        ▼           ▼
   [Archive]    [Prune]
```

## Ideas Backlog

> Ideas should not be lost. They are seeds for future growth.

- [ ] Contradiction detection algorithm
- [ ] Semantic clustering for dream consolidation
- [ ] Temporal query syntax ("as of date X")
- [ ] Memory importance based on citation count
- [ ] Hierarchical memory abstraction
- [ ] Cross-session pattern detection
- [ ] Goal-directed recall prioritization
- [ ] Memory visualization/exploration UI

---

*This document itself should be stored as a foundational memory.*
