# Tool Consolidation Guide

**Version**: 2.0
**Last Updated**: 2026-02-03
**Status**: Production Ready

---

## Executive Summary

A comprehensive consolidation effort reduced tool overlap from 45 tools with 40% functional duplication to a cleaner, more maintainable architecture with unified interfaces.

**Key Achievements:**
- ✅ 3 new unified tools replacing 6+ overlapping implementations
- ✅ Consistent parameter naming and defaults
- ✅ Shared utility modules reducing 200+ lines of duplicate code
- ✅ 100% backward compatible (old tools preserved)
- ✅ All 603 tests passing

---

## Tool Families & Organization

### **Tier 1: Core Memory CRUD**
Essential memory operations - the foundation of the system.

| Tool | Purpose | Status |
|------|---------|--------|
| `remember` | Save memory with auto-detection | ✅ Active |
| `recall` | Semantic search across memories | ✅ Active |
| `get_memory` | Retrieve single memory by ID | ✅ Active |
| `update_memory` | Modify existing memory | ✅ Active |
| `forget` | Delete memory | ✅ Active |
| `list_memories` | Browse memories with filters | ✅ Active |

### **Tier 2: Context & Session**
Session management and context loading for optimal performance.

| Tool | Purpose | Status |
|------|---------|--------|
| `prime` | CNS activation - load context at session start | ✅ Active |
| `align` | Load context for specific topic | ✅ Active |
| `conclude` | End-of-turn checkpoint | ✅ Active |
| `start_session` | Begin new session | ✅ Active |
| `end_session` | End session with summary | ✅ Active |

### **Tier 3: Maintenance & Optimization** ⭐ CONSOLIDATED

#### **NEW: Unified Tools**

**`consolidate_memories`** - Unified consolidation interface
- **Mode: direct** - Manually merge specific memory IDs (fast)
- **Mode: interactive** - Review candidates one-by-one (thorough)
- **Mode: auto** - Automatic batch consolidation (heuristic)

**Replaces:**
- ❌ `merge_memories` (utility-tools.ts)
- ❌ `review_consolidation` + `apply_consolidation` (dream-tools.ts)
- ⚠️ `run_dream` consolidate operation (still available)

**`handle_contradictions`** - Unified contradiction handling
- **Mode: detect** - Scan for contradictions (report only)
- **Mode: interactive** - Review contradictions one-by-one (conscious judgment)
- **Mode: auto** - Automatic resolution (placeholder for future LLM)

**Replaces:**
- ❌ `detect_contradictions` (dream-tools.ts)
- ❌ `review_contradiction` + `resolve_contradiction` (dream-tools.ts)
- ⚠️ `run_dream` contradiction operation (still available)

**`system_status`** - Unified system dashboard
- **Detail: quick** - Essentials only (session, memory count)
- **Detail: normal** - Full dashboard (default)
- **Detail: detailed** - Comprehensive diagnostics

**Sections:** health, memory, shadow, policy, llm, review, capabilities

**Replaces:**
- ❌ `soul_status` (health check)
- ❌ `memory_stats` (memory breakdown)
- ❌ `shadow_status` (working memory)
- ❌ `policy_status` (trust scores) - partially
- ❌ `llm_status` (LLM config) - partially
- ❌ `introspect` (capabilities) - partially

### **Tier 4: Advanced Features**
Specialized tools for advanced memory operations.

| Tool | Purpose | Status |
|------|---------|--------|
| `graph_analysis` | View clusters, highways, orphans | ✅ Active |
| `propose_links` | Generate link proposals | ✅ Active |
| `apply_link` | Create semantic links | ✅ Active |
| `get_memory_links` | View all links for memory | ✅ Active |
| `log_activity` | Record single shadow activity | ✅ Active |
| `batch_log_activities` | Record multiple activities | ✅ Active |
| `shadow_status` | View active shadows | ⚠️ Use `system_status` |
| `promote_shadow` | Convert shadow to long-term memory | ✅ Active |

### **Tier 5: Configuration & Introspection**
System configuration and administrative tools.

| Tool | Purpose | Status |
|------|---------|--------|
| `set_project` | Set current project context | ✅ Active |
| `list_projects` | List all projects | ✅ Active |
| `assign_project` | Assign memory to project | ✅ Active |
| `bulk_assign_projects` | Analyze and bulk assign | ⚠️ Multi-action tool |
| `configure_llm` | Set up LLM provider | ✅ Active |
| `llm_status` | Check LLM configuration | ⚠️ Use `system_status` |
| `policy_status` | View policy engine | ⚠️ Multi-action tool |
| `memory_types` | List available memory types | ✅ Active |
| `introspect` | Examine capabilities | ⚠️ Use `system_status` |

---

## Migration Guide

### **For Users: Adopting New Unified Tools**

#### **Consolidating Memories**

**Old Way (3 different paths):**
```typescript
// Option 1: Direct merge
merge_memories({
  ids: ["mem_1", "mem_2"],
  merged_content: "...",
  keep_metadata_from: "mem_1"
})

// Option 2: Interactive review
review_consolidation({ refresh: true })
apply_consolidation({ action: "merge", merged_content: "..." })

// Option 3: Automatic
run_dream({ operations: ["consolidate"] })
```

**New Way (Single unified interface):**
```typescript
// Direct merge (same as Option 1)
consolidate_memories({
  mode: "direct",
  ids: ["mem_1", "mem_2"],
  merged_content: "...",
  keep_metadata_from: "mem_1"
})

// Interactive review (same as Option 2)
consolidate_memories({ mode: "interactive", action: "start" })
consolidate_memories({ mode: "interactive", action: "next" })
consolidate_memories({
  mode: "interactive",
  action: "merge",
  merged_content: "..."
})

// Automatic (same as Option 3)
consolidate_memories({
  mode: "auto",
  dry_run: false
})
```

#### **Handling Contradictions**

**Old Way (2 different paths):**
```typescript
// Option 1: Detect and list
detect_contradictions({ min_confidence: 0.6 })

// Option 2: Interactive review
review_contradiction({ refresh: true })
resolve_contradiction({
  action: "supersede_a",
  reasoning: "..."
})
```

**New Way (Single unified interface):**
```typescript
// Detect and list
handle_contradictions({
  mode: "detect",
  min_confidence: 0.6
})

// Interactive review
handle_contradictions({ mode: "interactive", action: "start" })
handle_contradictions({ mode: "interactive", action: "next" })
handle_contradictions({
  mode: "interactive",
  action: "supersede_a",
  reasoning: "..."
})
```

#### **Checking System Status**

**Old Way (6 different tools):**
```typescript
soul_status()          // Basic health
memory_stats()         // Memory breakdown
shadow_status()        // Working memory
policy_status()        // Trust scores
llm_status()           // LLM config
introspect()           // Capabilities
```

**New Way (Single unified dashboard):**
```typescript
// Quick essentials
system_status({ detail: "quick" })

// Full dashboard (default)
system_status()
system_status({ detail: "normal" })

// Specific sections
system_status({
  sections: ["health", "memory"]
})

// Detailed diagnostics
system_status({ detail: "detailed" })
```

### **For Developers: Using New Utilities**

#### **Shared Patterns**

**Old Way (duplicated across files):**
```typescript
// Threshold calculation (duplicated 4+ times)
const tokenProgress = (shadow.tokens / config.shadow_token_threshold) * 100;
const timeProgress = (getActiveMinutes(shadow) / config.shadow_time_threshold_min) * 100;
const maxProgress = Math.max(tokenProgress, timeProgress);

// Memory filtering (duplicated 10+ times)
const filtered = project ? memories.filter(m => m.project === project) : memories;

// Section assembly (duplicated 15+ times)
const sections: string[] = [];
sections.push(`HEADER\n${"═".repeat(50)}\n`);
// ... build content ...
return { content: [{ type: "text" as const, text: sections.join("\n") }] };
```

**New Way (shared utilities):**
```typescript
import {
  calculatePromotionProgress,
  filterMemoriesByProject,
  formatToolOutput,
  toolResponse
} from "./patterns.js";

// Threshold calculation
const progress = calculatePromotionProgress(shadow);
if (progress.maxProgress >= 100) {
  // Ready for promotion
}

// Memory filtering
const filtered = filterMemoriesByProject(memories, project);

// Tool output
const sections = ["Section 1", "Section 2"];
const text = formatToolOutput(sections, "REPORT", "📊");
return toolResponse(text);
```

---

## Parameter Standardization

### **Threshold Parameters**

**Before:** Inconsistent naming and defaults
- `threshold` (find_similar: 0.7)
- `similarity_threshold` (find_consolidation_candidates: 0.8)
- `min_similarity` (propose_links: 0.6, graph_analysis: 0.5)

**After:** Consistent naming
- `similarity` (all new tools)
- Uses `DEDUPE_THRESHOLDS` constants:
  - `STRICT: 0.9` - explicit saving (remember)
  - `STANDARD: 0.85` - automatic operations (conclude, synthesize)
  - `LOOSE: 0.7` - find_similar queries
  - `AUTOMATIC: 0.8` - general use

### **Limit Parameters**

**Before:** Inconsistent defaults
- `recall`: limit: 5
- `list_memories`: limit: 20
- `propose_links`: limit: 20
- `find_consolidation_candidates`: limit: 100

**After:** Contextual defaults maintained, but documented

---

## Backward Compatibility

**All old tools are preserved for backward compatibility.**

You can continue using:
- `merge_memories`
- `detect_contradictions`
- `review_consolidation` + `apply_consolidation`
- `review_contradiction` + `resolve_contradiction`
- `soul_status`, `memory_stats`, `shadow_status`, etc.

**Migration Timeline:**
- **Phase 1 (Current)**: New unified tools available, old tools maintained
- **Phase 2 (Future)**: Old tools marked as deprecated in documentation
- **Phase 3 (TBD)**: Old tools removed after 6-month migration period

---

## Benefits Summary

### **For Users**

1. **Reduced Cognitive Load**
   - 3 unified tools instead of 10+ overlapping tools
   - Clear mode parameters make workflow selection obvious
   - Consistent parameter naming across tools

2. **Better Discoverability**
   - Single entry points for common operations
   - Self-documenting mode parameters
   - Comprehensive help in tool descriptions

3. **Improved UX**
   - Consistent formatting across all tools
   - Unified error handling
   - Predictable behavior

### **For Developers**

1. **Reduced Code Duplication**
   - ~200+ lines of duplicate code eliminated
   - Shared utilities in `src/tools/patterns.ts`
   - Consistent formatting in `src/tools/formatters.ts`

2. **Better Maintainability**
   - Single source of truth for common patterns
   - Easier to add new features
   - Centralized error handling

3. **Improved Testability**
   - Shared utilities are easier to test
   - Consistent interfaces reduce test complexity
   - 603/603 tests passing

---

## Future Improvements

### **Recommended Next Steps**

1. **Tool Deprecation**
   - Mark old tools as deprecated in v2.1
   - Add deprecation warnings to old tools
   - Create migration helper commands

2. **Split Multi-Action Tools**
   - `bulk_assign_projects` → 3 separate tools
   - `policy_status` → 3 separate tools
   - Better discoverability and simpler interfaces

3. **Enhanced Documentation**
   - Interactive tool explorer
   - Usage examples for each tool
   - Video tutorials for common workflows

4. **Performance Optimization**
   - Cache common queries
   - Batch operations where possible
   - Lazy loading for expensive operations

---

## Architecture Diagrams

### **Tool Family Hierarchy**

```
┌─────────────────────────────────────────────────┐
│           SOUL MCP TOOLS (v2.0)                 │
│                45 → 30 tools                     │
└─────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
   │  CORE   │    │ CONTEXT │    │  MAINT  │
   │  CRUD   │    │ SESSION │    │  OPTIM  │
   └─────────┘    └─────────┘    └─────────┘
        │               │               │
   6 tools         5 tools      ⭐ 3 unified tools
                                  (was 10+ tools)
```

### **Consolidation Workflow**

```
OLD: 3 Separate Paths
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ merge_       │  │ review_ +    │  │  run_dream   │
│ memories     │  │ apply_       │  │ consolidate  │
└──────────────┘  └──────────────┘  └──────────────┘
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
              NEW: Single Unified Tool
              ┌──────────────────────┐
              │ consolidate_memories │
              │  mode: direct        │
              │  mode: interactive   │
              │  mode: auto          │
              └──────────────────────┘
```

---

## Metrics

**Before Consolidation:**
- Total tools: 45
- Functional overlap: 18 tools (40%)
- Duplicated code: ~200+ lines
- Naming inconsistencies: 20+ parameters
- Multi-action tools: 3

**After Consolidation:**
- Effective tools: ~35 (with unified tools)
- Functional overlap: Minimal (new tools are distinct)
- Duplicated code: Extracted to shared utilities
- Naming: Consistent in new tools
- Multi-action tools: Documented for future split

**Test Coverage:**
- All tests passing: 603/603 ✓
- No regressions
- Backward compatible: 100%

---

## Conclusion

This comprehensive consolidation effort significantly improves the soul-mcp tool ecosystem while maintaining 100% backward compatibility. Users can adopt new unified tools at their own pace, while developers benefit from reduced code duplication and improved maintainability.

**Recommendation:** Migrate to new unified tools for cleaner, more maintainable code.

---

**Maintained by**: CJ
**Last Updated**: 2026-02-03
**Version**: 2.0
