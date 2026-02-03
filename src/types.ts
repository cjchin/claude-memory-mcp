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

  // Emotional Intelligence (v3.0 Phase 1)
  emotional_context?: EmotionalContext;    // Optional emotional metadata

  // Narrative Intelligence (v3.0 Phase 2)
  narrative_context?: NarrativeContext;    // Optional narrative metadata

  // Multi-Agent Intelligence (v3.0 Phase 3)
  multi_agent_context?: MultiAgentContext; // Optional multi-agent metadata
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
// Emotional Intelligence Types - Phase 1 of v3.0 Evolution
// ============================================================================

/**
 * Basic emotions (Ekman's six universal emotions + neutral)
 */
export type BasicEmotion =
  | "joy"
  | "sadness"
  | "fear"
  | "anger"
  | "surprise"
  | "disgust"
  | "neutral";

/**
 * Emotional context for a memory (Russell's Circumplex Model)
 *
 * Uses two-dimensional valence-arousal model:
 * - Valence: negative (-1) to positive (+1)
 * - Arousal: calm (0) to excited (1)
 *
 * Examples:
 * - Happy: valence=0.8, arousal=0.6
 * - Sad: valence=-0.7, arousal=0.2
 * - Angry: valence=-0.6, arousal=0.9
 * - Calm: valence=0.2, arousal=0.1
 */
export interface EmotionalContext {
  // Core dimensions (Russell's Circumplex)
  valence: number;                    // -1 (negative) to +1 (positive)
  arousal: number;                    // 0 (calm) to 1 (excited)

  // Discrete emotions (Ekman)
  dominant_emotion?: BasicEmotion;    // Primary emotion
  secondary_emotions?: Array<{        // Secondary emotions with intensity
    emotion: string;                  // Emotion label (can be more nuanced than BasicEmotion)
    intensity: number;                // 0-1, how strong this emotion is
  }>;

  // Emotional evolution (for belief updates)
  initial_emotion?: string;           // Original emotional state
  current_emotion?: string;           // Current emotional state (if changed)

  // Confidence and source
  emotional_confidence?: number;      // 0-1, how confident the inference is
  detected_by?: "explicit" | "inferred" | "user_specified"; // Origin of emotional data

  // Timestamp (for decay calculations)
  emotional_timestamp?: string;       // When emotion was captured
}

/**
 * Emotional decay parameters (Phase 1)
 *
 * Models psychological phenomena:
 * - Hedonic adaptation: positive emotions fade faster
 * - Negativity bias: negative emotions linger
 * - Flashbulb memory: high arousal resists decay
 */
export interface EmotionalDecayConfig {
  positive_decay_rate: number;       // How fast positive valence fades (default: 0.15/day)
  negative_decay_rate: number;       // How fast negative valence fades (default: 0.08/day)
  arousal_protection: number;        // High arousal slows decay (default: 0.5)
  flashbulb_threshold: number;       // Arousal level for flashbulb effect (default: 0.8)
}

// ============================================================================
// Narrative Intelligence Types - Phase 2 of v3.0 Evolution
// ============================================================================

/**
 * Narrative role in story structure (Freytag's Pyramid)
 */
export type NarrativeRole =
  | "exposition"       // Background, context, setup
  | "rising_action"    // Complications, challenges building
  | "climax"           // Peak tension, critical decision/turning point
  | "falling_action"   // Consequences unfolding
  | "resolution";      // Outcome, closure, lessons learned

/**
 * Narrative context for a memory (story structure)
 *
 * Enables detection of story arcs and causal chains across memories.
 * Based on Freytag's Pyramid (dramatic structure) and narrative identity theory.
 *
 * Examples:
 * - Bug discovery: exposition (context) → rising_action (investigation) → climax (root cause found) → resolution (fix applied)
 * - Feature development: exposition (requirements) → rising_action (implementation) → climax (integration challenge) → falling_action (resolution) → resolution (deployed)
 */
export interface NarrativeContext {
  // Story structure (Freytag's Pyramid)
  narrative_role?: NarrativeRole;      // Where in the story arc this memory fits

  // Story arc tracking
  story_arc_id?: string;               // ID linking memories in the same story arc

  // Causal relationships
  caused_by_memory?: string;           // Memory ID that caused this event
  leads_to_memory?: string;            // Memory ID that resulted from this event

  // Significance markers
  turning_point?: boolean;             // Is this a critical decision/realization?
  resolution_of?: string;              // Memory ID of problem/question this resolves

  // Thematic elements
  themes?: string[];                   // Extracted themes (e.g., "authentication", "performance")
  characters?: string[];               // Key actors/agents involved

  // Confidence and source
  narrative_confidence?: number;       // 0-1, how confident the inference is
  detected_by?: "explicit" | "inferred" | "llm_assisted"; // Origin of narrative data
}

// ============================================================================
// Multi-Agent Intelligence Types - Phase 3 of v3.0 Evolution
// ============================================================================

/**
 * Agent type classification
 */
export type AgentType =
  | "claude"      // Claude AI agent (Sonnet, Opus, etc.)
  | "human"       // Human user
  | "walker"      // Autonomous walker agent
  | "custom";     // Custom agent implementation

/**
 * Agent identity and capabilities
 *
 * Represents an individual agent that can create and access memories
 * in the shared soul system.
 */
export interface AgentIdentity {
  agent_id: string;                    // Unique agent identifier
  agent_name?: string;                 // Human-readable name
  agent_type: AgentType;               // Type of agent
  trust_level?: number;                // 0-1, how much to trust this agent
  capabilities?: string[];             // What this agent can do
  created_at?: string;                 // When agent was registered
  last_active?: string;                // Last time agent accessed soul
}

/**
 * Memory access control
 */
export interface MemoryACL {
  read_access: string[];               // Agent IDs with read permission
  write_access: string[];              // Agent IDs with write permission
  owner: string;                       // Agent ID of memory owner
  visibility: "private" | "team" | "public"; // Visibility level
}

/**
 * Consensus status for memories with multiple contributors
 */
export type ConsensusStatus =
  | "agreed"      // All agents agree on this memory
  | "disputed"    // Agents disagree, needs resolution
  | "pending"     // Awaiting input from more agents
  | "resolved";   // Disagreement resolved through process

/**
 * Multi-agent context for memories
 *
 * Tracks collaboration, consensus, and shared knowledge across agents.
 */
export interface MultiAgentContext {
  // Collaboration tracking
  created_by?: AgentIdentity;          // Agent that created this memory
  contributors?: AgentIdentity[];      // Agents that contributed to this memory
  last_modified_by?: string;           // Agent ID of last modifier

  // Consensus tracking
  consensus_status?: ConsensusStatus;  // Agreement status
  agreed_by?: string[];                // Agent IDs that agree
  disputed_by?: string[];              // Agent IDs that dispute
  dispute_reason?: string;             // Why agents disagree

  // Conflict resolution
  resolution_method?: "vote" | "synthesize" | "defer_expert" | "accept_both"; // How conflict was resolved
  resolution_timestamp?: string;       // When conflict was resolved
  resolver_agent?: string;             // Agent ID that resolved conflict

  // Access control
  acl?: MemoryACL;                     // Access control list

  // Shared knowledge
  shared_with?: Array<{                // Agents this was explicitly shared with
    agent_id: string;
    shared_at: string;
    reason?: string;
  }>;

  // Confidence and validation
  validation_count?: number;           // How many agents validated this
  validators?: string[];               // Agent IDs that validated
  crowd_confidence?: number;           // 0-1, collective confidence

  // Metadata
  collaboration_session?: string;      // Session ID if created in collaboration
  detected_by?: "explicit" | "inferred" | "consensus"; // Origin of multi-agent data
}

// ============================================================================
// Shadow Log Types - Ephemeral Working Memory
// ============================================================================

/**
 * Activity types tracked in the shadow log
 */
export type ShadowActivityType =
  | "file_read"      // Reading a file
  | "file_write"     // Writing a file
  | "search"         // Grep, glob, or semantic search
  | "command"        // Bash command execution
  | "tool_use"       // Using any MCP tool
  | "topic_mention"  // Topic referenced in conversation
  | "topic_shift"    // Explicit topic change
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
  metadata?: {                   // Optional metadata
    count?: number;              // Deduplication count (how many times this occurred)
    first_seen?: string;         // First occurrence timestamp
    last_seen?: string;          // Most recent occurrence timestamp
  };
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
