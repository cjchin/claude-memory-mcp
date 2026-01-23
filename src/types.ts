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
  | "superseded";   // Memory replaced by newer information

// Memory layer in the soul architecture
export type MemoryLayer =
  | "conscious"     // Recent, active working memory
  | "long_term"     // Consolidated, semantically indexed
  | "foundational"; // Core identity, immutable truths

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  timestamp: string;
  project?: string;
  session_id?: string;
  importance: number;  // 1-5, affects retrieval priority
  access_count: number;
  last_accessed?: string;
  related_memories?: string[];
  metadata?: Record<string, unknown>;
  
  // Temporal soul fields
  layer?: MemoryLayer;           // Which layer this memory lives in
  valid_from?: string;           // When this belief became true
  valid_until?: string;          // When superseded (if applicable)
  supersedes?: string;           // ID of memory this replaces
  superseded_by?: string;        // ID of memory that replaced this
  confidence?: number;           // 0-1, how certain we are
  source?: "human" | "inferred" | "consolidated"; // Origin of memory
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
