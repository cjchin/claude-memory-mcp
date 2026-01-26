export type MemoryType =
  | "decision"      // Architectural or design decisions
  | "pattern"       // Code patterns or conventions discovered
  | "learning"      // Things learned (bugs, gotchas, insights)
  | "context"       // Project context, requirements, constraints
  | "preference"    // User preferences and workflow choices
  | "summary"       // Auto-generated session summaries
  | "todo"          // Future work or follow-ups
  | "reference"     // External references, docs, links
  | "foundational"  // Core identity, goals, values - never decays
  | "contradiction" // Detected conflict between memories
  | "superseded"    // Memory replaced by newer information
  | "shadow";       // Auto-promoted from shadow log (ephemeral working memory)

// Memory layer in the soul architecture
export type MemoryLayer =
  | "conscious"     // Recent, active working memory
  | "long_term"     // Consolidated, semantically indexed
  | "foundational"; // Core identity, immutable truths

// Memory scope (from Mem0: who can access this memory)
export type MemoryScope =
  | "personal"      // Only the user who created it
  | "team"          // Shared with team members
  | "project";      // Scoped to a specific project

// Link relationship types (Zettelkasten principle #4: explain WHY notes are linked)
export type LinkType =
  | "related"       // General semantic relationship
  | "supports"      // This memory provides evidence for linked memory
  | "contradicts"   // This memory conflicts with linked memory
  | "extends"       // This memory extends/elaborates linked memory
  | "supersedes"    // This memory replaces linked memory
  | "depends_on"    // This memory requires linked memory for context
  | "caused_by"     // This memory resulted from linked memory
  | "implements"    // This memory is an implementation of linked memory
  | "example_of";   // This memory is an example of linked memory

/**
 * Rich link with context (Zettelkasten principle: explain WHY linked)
 */
export interface MemoryLink {
  targetId: string;           // ID of linked memory
  type: LinkType;             // Relationship type
  reason?: string;            // Human-readable explanation of why linked
  strength?: number;          // 0-1, how strong is the connection
  createdAt: string;          // When link was created
  createdBy?: string;         // "human" | "walker" | walker ID
}

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  timestamp: string;             // Event time: when this actually happened
  ingestion_time?: string;       // When this was recorded in the soul (bi-temporal)
  project?: string;
  session_id?: string;
  importance: number;            // 1-5, affects retrieval priority
  access_count: number;
  last_accessed?: string;
  related_memories?: string[];              // Simple link IDs (backward compat)
  links?: MemoryLink[];                     // Rich links with context (Zettelkasten)
  metadata?: Record<string, unknown>;

  // Scope field (from Mem0)
  scope?: MemoryScope;           // Who can access: personal, team, or project
  owner?: string;                // User/agent who created this memory

  // Temporal soul fields
  layer?: MemoryLayer;           // Which layer this memory lives in
  valid_from?: string;           // When this belief became true
  valid_until?: string;          // When superseded (if applicable)
  supersedes?: string;           // ID of memory this replaces
  superseded_by?: string;        // ID of memory that replaced this
  confidence?: number;           // 0-1, how certain we are
  source?: "human" | "inferred" | "consolidated" | "llm_consolidated" | "conscious_merge" | "conscious_consolidation"; // Origin of memory
}

export interface Session {
  id: string;
  project?: string;
  started_at: string;
  ended_at?: string;
  summary?: string;
  memory_ids: string[];
}

export interface ProjectContext {
  name: string;
  description?: string;
  tech_stack?: string[];
  conventions?: string[];
  created_at: string;
  last_active: string;
}

export const MEMORY_TYPE_DESCRIPTIONS: Record<MemoryType, string> = {
  decision: "Architectural or design decisions made",
  pattern: "Code patterns, conventions, or idioms",
  learning: "Bugs found, gotchas discovered, insights gained",
  context: "Project requirements, constraints, background",
  preference: "User preferences, workflow choices, tool configs",
  summary: "Auto-generated session summaries",
  todo: "Future work, follow-ups, ideas to explore",
  reference: "External docs, links, resources",
  foundational: "Core identity, goals, values - immortal truths",
  contradiction: "Detected conflict requiring resolution",
  superseded: "Historical memory replaced by newer information",
  shadow: "Auto-promoted from shadow log working memory",
};

export const DEFAULT_TAGS = [
  "architecture",
  "api",
  "database",
  "auth",
  "performance",
  "security",
  "testing",
  "deployment",
  "refactor",
  "bugfix",
  "feature",
  "config",
  "documentation",
  "dependencies",
] as const;

// Dream state operations
export type DreamOperation =
  | "consolidate"    // Merge similar memories
  | "decay"          // Apply importance decay
  | "contradiction"  // Detect and flag conflicts
  | "prune"          // Archive low-value memories
  | "link"           // Discover related_memories connections
  | "summarize";     // Create summaries of memory clusters

export interface DreamReport {
  started_at: string;
  completed_at: string;
  operations: DreamOperation[];
  memories_processed: number;
  consolidations: number;
  contradictions_found: Array<{
    memory_a: string;
    memory_b: string;
    conflict_type: "direct" | "temporal" | "semantic";
    explanation: string;
  }>;
  memories_decayed: number;
  memories_pruned: number;
  links_created: number;
  summaries_created: string[];  // IDs of new summary memories
}

// Foundational memory categories
export type FoundationalCategory =
  | "identity"    // Who am I?
  | "goals"       // What am I trying to achieve?
  | "values"      // What principles guide me?
  | "constraints" // What must I never do?
  | "style";      // How do I communicate/work?

export interface FoundationalMemory extends Memory {
  type: "foundational";
  layer: "foundational";
  category: FoundationalCategory;
  importance: 5;  // Always maximum
  confidence: 1;  // Always certain
}

// ============================================================================
// Shadow Log Types - Ephemeral Working Memory
// ============================================================================

/**
 * Activity types tracked in the shadow log
 */
export type ShadowActivityType =
  | "file_read"      // Reading a file
  | "search"         // Grep, glob, or semantic search
  | "tool_use"       // Using any MCP tool
  | "topic_mention"  // Topic referenced in conversation
  | "memory_access"; // Accessing long-term memory (recall, remember, get_memory)

/**
 * Status of a shadow entry
 */
export type ShadowStatus =
  | "active"    // Currently accumulating activity
  | "idle"      // No recent activity, candidate for promotion
  | "promoted"  // Converted to long-term memory
  | "decayed";  // Expired without promotion

/**
 * A single activity recorded in the shadow log
 */
export interface ShadowActivity {
  timestamp: string;             // ISO timestamp
  type: ShadowActivityType;      // What kind of activity
  detail: string;                // File path, search query, tool name, etc.
  tokens?: number;               // Estimated tokens for this activity
}

/**
 * A shadow entry - ephemeral working memory that can be promoted to long-term
 */
export interface ShadowEntry {
  id: string;                    // shadow_<timestamp>_<random>
  session_id: string;            // Which Claude session
  topic: string;                 // Detected/inferred topic

  // Timing
  created_at: string;            // When this shadow started
  last_activity: string;         // Last activity timestamp

  // Accumulated activity
  activities: ShadowActivity[];  // All recorded activities
  tokens: number;                // Total density measure

  // State
  status: ShadowStatus;          // Current status

  // Compression (generated when idle/promoted)
  summary?: string;              // Summary of activity

  // Metadata
  project?: string;              // Project context
  promoted_memory_id?: string;   // ID of memory created on promotion
}
