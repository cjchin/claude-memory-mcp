import { ChromaClient, Collection, IncludeEnum } from "chromadb";
import { embed } from "./embeddings.js";
import { config } from "./config.js";
import type { Memory, MemoryType, MemoryLayer, MemoryScope, Session, ProjectContext } from "./types.js";
import {
  hybridScore,
  expandWithGraphNeighbors,
  type ScoredMemory,
  type HybridSearchConfig,
} from "./hybrid-search.js";
import {
  DatabaseError,
  ParsingError,
  NotFoundError,
  withRetry,
} from "./errors.js";

const MEMORIES_COLLECTION = "claude_memories";
const SESSIONS_COLLECTION = "claude_sessions";
const PROJECTS_COLLECTION = "claude_projects";

const DB = {
  DEFAULT_SEARCH_LIMIT: 10,
  SEARCH_FETCH_MULTIPLIER: 2,     // Fetch 2x results before filtering
  GRAPH_MEMORY_LIMIT: 500,        // Max memories for graph building
  IMPORTANCE_BOOST_FACTOR: 0.1,   // Score boost per importance level above 3
  ACCESS_BOOST_FACTOR: 0.02,      // Score boost per access count
  ACCESS_BOOST_MAX: 0.2,          // Cap on access-based score boost
  DEFAULT_HYBRID_SEMANTIC_WEIGHT: 0.6,
  DEFAULT_HYBRID_BM25_WEIGHT: 0.3,
  DEFAULT_HYBRID_GRAPH_WEIGHT: 0.1,
  DEFAULT_HYBRID_GRAPH_MAX_DISTANCE: 2,
  GRAPH_EXPANSION_SCORE: 0.1,     // Score assigned to graph-expanded results
  DEFAULT_SIMILAR_THRESHOLD: 0.85,
} as const;

/**
 * Database connection state.
 *
 * ARCHITECTURE NOTE: These are module-level singletons. In Node.js single-threaded
 * execution, lazy initialization is safe. The initPromise prevents race conditions
 * if multiple async operations call initDb() simultaneously.
 */
let client: ChromaClient | null = null;
let memoriesCollection: Collection | null = null;
let sessionsCollection: Collection | null = null;
let projectsCollection: Collection | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize database connection. Safe to call multiple times - will only
 * initialize once. Concurrent calls will wait for the same initialization.
 */
export async function initDb(): Promise<void> {
  // Already initialized
  if (client && memoriesCollection && sessionsCollection && projectsCollection) {
    return;
  }

  // Initialization in progress - wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      client = new ChromaClient({
        path: `http://${config.chroma_host}:${config.chroma_port}`,
      });

      memoriesCollection = await client.getOrCreateCollection({
        name: MEMORIES_COLLECTION,
        metadata: { description: "Claude session memories and insights" },
      });

      sessionsCollection = await client.getOrCreateCollection({
        name: SESSIONS_COLLECTION,
        metadata: { description: "Session tracking" },
      });

      projectsCollection = await client.getOrCreateCollection({
        name: PROJECTS_COLLECTION,
        metadata: { description: "Project contexts" },
      });

      console.error(`Connected to ChromaDB at ${config.chroma_host}:${config.chroma_port}`);
    } catch (error) {
      // Reset state on failure so retry is possible
      client = null;
      memoriesCollection = null;
      sessionsCollection = null;
      projectsCollection = null;
      initPromise = null;

      const isConnectionError = error instanceof Error &&
        (error.message.includes("ECONNREFUSED") || error.message.includes("fetch"));

      throw new DatabaseError(
        `Failed to initialize ChromaDB at ${config.chroma_host}:${config.chroma_port}: ${error}`,
        isConnectionError
      );
    }
  })();

  await initPromise;
  initPromise = null;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ MEMORY PARSING HELPER ============

/**
 * Parse ChromaDB metadata into a Memory object.
 * Single source of truth for metadata → Memory conversion.
 */
function parseMemoryFromChroma(
  id: string,
  document: string,
  metadata: Record<string, any>,
  extras?: Record<string, any>
): Memory {
  const memory: Memory = {
    id,
    content: document,
    type: (metadata.type as MemoryType) || "context",
    tags: ((metadata.tags as string) || "").split(",").filter(Boolean),
    timestamp: (metadata.timestamp as string) || "",
    ingestion_time: (metadata.ingestion_time as string) || undefined,
    project: (metadata.project as string) || undefined,
    session_id: (metadata.session_id as string) || undefined,
    importance: (metadata.importance as number) || 3,
    access_count: (metadata.access_count as number) || 0,
    last_accessed: (metadata.last_accessed as string) || undefined,
    related_memories: ((metadata.related_memories as string) || "")
      .split(",")
      .filter(Boolean),
    scope: ((metadata.scope as string) || "personal") as MemoryScope,
    owner: (metadata.owner as string) || undefined,
    layer: ((metadata.layer as string) || "long_term") as MemoryLayer,
    valid_from: (metadata.valid_from as string) || undefined,
    valid_until: (metadata.valid_until as string) || undefined,
    supersedes: (metadata.supersedes as string) || undefined,
    superseded_by: (metadata.superseded_by as string) || undefined,
    confidence: (metadata.confidence as number) ?? 1,
    source: ((metadata.source as string) || "human") as Memory["source"],
  };

  // Parse rich links from links_json
  if (metadata.links_json) {
    try {
      memory.links = JSON.parse(metadata.links_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse links_json for memory ${id}`,
        "links_json",
        metadata.links_json
      );
      console.error(error.message, "Raw value:", String(metadata.links_json).slice(0, 100));
    }
  }

  // Parse metadata_json
  if (metadata.metadata_json) {
    try {
      memory.metadata = JSON.parse(metadata.metadata_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse metadata_json for memory ${id}`,
        "metadata_json",
        metadata.metadata_json
      );
      console.error(error.message, "Raw value:", String(metadata.metadata_json).slice(0, 100));
    }
  }

  // Parse intelligence contexts (v3.0)
  if (metadata.emotional_context_json) {
    try {
      memory.emotional_context = JSON.parse(metadata.emotional_context_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse emotional_context_json for memory ${id}`,
        "emotional_context_json",
        metadata.emotional_context_json
      );
      console.error(error.message, "Raw value:", String(metadata.emotional_context_json).slice(0, 100));
    }
  }

  if (metadata.narrative_context_json) {
    try {
      memory.narrative_context = JSON.parse(metadata.narrative_context_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse narrative_context_json for memory ${id}`,
        "narrative_context_json",
        metadata.narrative_context_json
      );
      console.error(error.message, "Raw value:", String(metadata.narrative_context_json).slice(0, 100));
    }
  }

  if (metadata.multi_agent_context_json) {
    try {
      memory.multi_agent_context = JSON.parse(metadata.multi_agent_context_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse multi_agent_context_json for memory ${id}`,
        "multi_agent_context_json",
        metadata.multi_agent_context_json
      );
      console.error(error.message, "Raw value:", String(metadata.multi_agent_context_json).slice(0, 100));
    }
  }

  if (metadata.social_context_json) {
    try {
      memory.social_context = JSON.parse(metadata.social_context_json as string);
    } catch (e) {
      const error = new ParsingError(
        `Failed to parse social_context_json for memory ${id}`,
        "social_context_json",
        metadata.social_context_json
      );
      console.error(error.message, "Raw value:", String(metadata.social_context_json).slice(0, 100));
    }
  }

  // Merge any extra fields (e.g. score, embedding)
  if (extras) {
    Object.assign(memory, extras);
  }

  return memory;
}

// ============ MEMORY OPERATIONS ============

export async function saveMemory(
  memory: Omit<Memory, "id" | "access_count">,
  options: { bidirectionalLink?: boolean } = {}
): Promise<string> {
  if (!memoriesCollection) await initDb();

  const id = generateId("mem");
  const embedding = await embed(memory.content);
  const now = new Date().toISOString();
  const { bidirectionalLink = true } = options;

  await withRetry(() => memoriesCollection!.add({
    ids: [id],
    embeddings: [embedding],
    documents: [memory.content],
    metadatas: [
      {
        type: memory.type,
        tags: memory.tags.join(","),
        timestamp: memory.timestamp,              // Event time (when it happened)
        ingestion_time: memory.ingestion_time || now,  // When recorded (bi-temporal)
        project: memory.project || "",
        session_id: memory.session_id || "",
        importance: memory.importance,
        access_count: 0,
        last_accessed: "",
        related_memories: memory.related_memories?.join(",") || "",
        metadata_json: memory.metadata ? JSON.stringify(memory.metadata) : "",
        // Scope fields (from Mem0)
        scope: memory.scope || "personal",
        owner: memory.owner || "",
        // Soul temporal fields
        layer: memory.layer || "long_term",
        valid_from: memory.valid_from || memory.timestamp,
        valid_until: memory.valid_until || "",
        supersedes: memory.supersedes || "",
        superseded_by: memory.superseded_by || "",
        confidence: memory.confidence ?? 1,
        source: memory.source || "human",
        // Intelligence contexts (v3.0) - serialized as JSON
        emotional_context_json: memory.emotional_context ? JSON.stringify(memory.emotional_context) : "",
        narrative_context_json: memory.narrative_context ? JSON.stringify(memory.narrative_context) : "",
        multi_agent_context_json: memory.multi_agent_context ? JSON.stringify(memory.multi_agent_context) : "",
        social_context_json: memory.social_context ? JSON.stringify(memory.social_context) : "",
      },
    ],
  }));

  // Bidirectional linking (from A-MEM): update related memories to link back
  if (bidirectionalLink && memory.related_memories?.length) {
    await createBidirectionalLinks(id, memory.related_memories);
  }

  return id;
}

/**
 * Create bidirectional links between memories (from A-MEM pattern)
 * When A links to B, B should also link to A
 */
async function createBidirectionalLinks(newMemoryId: string, relatedIds: string[]): Promise<void> {
  for (const relatedId of relatedIds) {
    try {
      const relatedMemory = await getMemoryRaw(relatedId);
      if (!relatedMemory) continue;

      const existingLinks = relatedMemory.related_memories || [];
      if (!existingLinks.includes(newMemoryId)) {
        // Add the new memory to the related memory's links
        await updateMemoryMetadata(relatedId, {
          related_memories: [...existingLinks, newMemoryId].join(","),
        });
      }
    } catch (e) {
      // Don't fail the whole save if bidirectional linking fails
      console.error(`Failed to create bidirectional link to ${relatedId}:`, e);
    }
  }
}

/**
 * Get memory without updating access count (for internal operations)
 */
async function getMemoryRaw(id: string): Promise<Memory | null> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [id],
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return null;

  return parseMemoryFromChroma(
    id,
    results.documents?.[0] || "",
    results.metadatas?.[0] || {}
  );
}

/**
 * Update only metadata fields (for internal operations like bidirectional linking)
 */
async function updateMemoryMetadata(
  id: string,
  metadataUpdates: Record<string, string | number | boolean>
): Promise<void> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [id],
    include: [IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return;

  const existingMetadata = results.metadatas?.[0] || {};

  await memoriesCollection!.update({
    ids: [id],
    metadatas: [{ ...existingMetadata, ...metadataUpdates } as Record<string, string | number | boolean>],
  });
}

export interface SearchOptions {
  limit?: number;
  types?: MemoryType[];
  tags?: string[];
  project?: string;
  minImportance?: number;
  includeDecayed?: boolean;
  // Hybrid search options
  useHybrid?: boolean;           // Enable hybrid search (BM25 + graph)
  hybridConfig?: Partial<HybridSearchConfig>;
  expandGraph?: boolean;         // Include graph neighbors in results
  graphExpansionLimit?: number;  // Max neighbors to add
}

export async function searchMemories(
  query: string,
  options: SearchOptions = {}
): Promise<(Memory & { score: number })[]> {
  if (!memoriesCollection) await initDb();

  const {
    limit = DB.DEFAULT_SEARCH_LIMIT,
    types,
    tags,
    project,
    minImportance,
    includeDecayed = false,
    useHybrid = false,
    hybridConfig,
    expandGraph = false,
    graphExpansionLimit = 3,
  } = options;

  const queryEmbedding = await embed(query);

  // Build where clause
  const whereConditions: any[] = [];

  if (types?.length) {
    whereConditions.push({ type: { $in: types } });
  }
  if (project) {
    whereConditions.push({ project: project });
  }
  if (minImportance) {
    whereConditions.push({ importance: { $gte: minImportance } });
  }

  const whereClause =
    whereConditions.length > 1
      ? { $and: whereConditions }
      : whereConditions[0] || undefined;

  const results = await withRetry(() => memoriesCollection!.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit * DB.SEARCH_FETCH_MULTIPLIER, // Fetch extra to filter
    where: whereClause,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
  }));

  if (!results.ids[0]?.length) return [];

  let memories = results.ids[0].map((id, i) => {
    const distance = results.distances?.[0]?.[i] || 0;
    const score = 1 - distance; // Convert distance to similarity

    return parseMemoryFromChroma(
      id,
      results.documents[0]?.[i] || "",
      results.metadatas[0]?.[i] || {},
      { score }
    ) as Memory & { score: number };
  });

  // Filter by tags if specified (ChromaDB doesn't support $contains well)
  if (tags?.length) {
    memories = memories.filter((m) =>
      tags.some((tag) => m.tags.includes(tag))
    );
  }

  // Apply memory decay if enabled
  if (config.enable_memory_decay && !includeDecayed) {
    const now = Date.now();
    const halfLifeMs = config.decay_half_life_days * 24 * 60 * 60 * 1000;

    memories = memories.map((m) => {
      const age = now - new Date(m.timestamp).getTime();
      const decayFactor = Math.pow(0.5, age / halfLifeMs);
      const boostFactor = 1 + (m.importance - 3) * DB.IMPORTANCE_BOOST_FACTOR;
      const accessBoost = Math.min(m.access_count * DB.ACCESS_BOOST_FACTOR, DB.ACCESS_BOOST_MAX);

      return {
        ...m,
        score: m.score * decayFactor * boostFactor + accessBoost,
      };
    });
  }

  // Apply hybrid scoring if enabled
  if (useHybrid) {
    // Get all memories for graph building (limited for performance)
    const allMemoriesForGraph = await getAllMemoriesForGraph(project);

    const defaultHybridConfig: HybridSearchConfig = {
      semanticWeight: DB.DEFAULT_HYBRID_SEMANTIC_WEIGHT,
      bm25Weight: DB.DEFAULT_HYBRID_BM25_WEIGHT,
      graphWeight: DB.DEFAULT_HYBRID_GRAPH_WEIGHT,
      graphMaxDistance: DB.DEFAULT_HYBRID_GRAPH_MAX_DISTANCE,
    };

    const mergedConfig = { ...defaultHybridConfig, ...hybridConfig };
    const hybridResults = hybridScore(memories, query, allMemoriesForGraph, mergedConfig);

    // Optionally expand with graph neighbors
    if (expandGraph && hybridResults.length > 0) {
      const neighbors = expandWithGraphNeighbors(
        hybridResults,
        allMemoriesForGraph,
        graphExpansionLimit,
        1  // Only immediate neighbors
      );

      // Add neighbors with a lower score indicator
      const neighborResults = neighbors.map((m) => ({
        ...m,
        score: DB.GRAPH_EXPANSION_SCORE,  // Low score to appear after main results
        semanticScore: 0,
        bm25Score: 0,
        graphBoost: 0.1,
        graphDistance: 1,
        _isGraphExpansion: true,
      }));

      return [...hybridResults.slice(0, limit), ...neighborResults] as any;
    }

    return hybridResults.slice(0, limit);
  }

  // Sort by adjusted score and limit (non-hybrid path)
  return memories
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get all memories for graph building (internal helper)
 * Limited to recent/important memories for performance
 */
async function getAllMemoriesForGraph(project?: string): Promise<Memory[]> {
  if (!memoriesCollection) await initDb();

  const whereClause = project ? { project } : undefined;

  const results = await memoriesCollection!.get({
    limit: DB.GRAPH_MEMORY_LIMIT,
    where: whereClause,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return [];

  return results.ids.map((id, i) =>
    parseMemoryFromChroma(
      id,
      results.documents?.[i] || "",
      results.metadatas?.[i] || {}
    )
  );
}

export async function getMemory(id: string): Promise<Memory | null> {
  if (!memoriesCollection) await initDb();

  const results = await withRetry(() => memoriesCollection!.get({
    ids: [id],
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  }));

  if (!results.ids.length) return null;

  const metadata = results.metadatas?.[0] || {};

  // Update access tracking
  const newAccessCount = ((metadata.access_count as number) || 0) + 1;
  const newLastAccessed = new Date().toISOString();

  await withRetry(() => memoriesCollection!.update({
    ids: [id],
    metadatas: [
      {
        ...metadata,
        access_count: newAccessCount,
        last_accessed: newLastAccessed,
      },
    ],
  }));

  return parseMemoryFromChroma(
    id,
    results.documents?.[0] || "",
    metadata,
    { access_count: newAccessCount, last_accessed: newLastAccessed }
  );
}

export async function updateMemory(
  id: string,
  updates: Partial<Omit<Memory, "id">>
): Promise<void> {
  if (!memoriesCollection) await initDb();

  const existing = await getMemory(id);
  if (!existing) {
    throw new NotFoundError(`Memory not found`, "memory", id);
  }

  const newContent = updates.content || existing.content;
  const embedding = updates.content ? await embed(newContent) : undefined;

  await withRetry(() => memoriesCollection!.update({
    ids: [id],
    embeddings: embedding ? [embedding] : undefined,
    documents: updates.content ? [newContent] : undefined,
    metadatas: [
      {
        type: updates.type || existing.type,
        tags: (updates.tags || existing.tags).join(","),
        timestamp: existing.timestamp,
        ingestion_time: existing.ingestion_time || existing.timestamp,
        project: updates.project ?? existing.project ?? "",
        session_id: existing.session_id || "",
        importance: updates.importance ?? existing.importance,
        access_count: existing.access_count,
        last_accessed: existing.last_accessed || "",
        related_memories: (updates.related_memories || existing.related_memories || []).join(","),
        metadata_json: updates.metadata ? JSON.stringify(updates.metadata) : (existing.metadata ? JSON.stringify(existing.metadata) : ""),
        // Scope fields
        scope: updates.scope || existing.scope || "personal",
        owner: updates.owner || existing.owner || "",
        // Soul temporal fields
        layer: updates.layer || existing.layer || "long_term",
        valid_from: updates.valid_from || existing.valid_from || existing.timestamp,
        valid_until: updates.valid_until || existing.valid_until || "",
        supersedes: updates.supersedes || existing.supersedes || "",
        superseded_by: updates.superseded_by || existing.superseded_by || "",
        confidence: updates.confidence ?? existing.confidence ?? 1,
        source: updates.source || existing.source || "human",
        // Intelligence contexts (v3.0)
        emotional_context_json: updates.emotional_context
          ? JSON.stringify(updates.emotional_context)
          : (existing.emotional_context ? JSON.stringify(existing.emotional_context) : ""),
        narrative_context_json: updates.narrative_context
          ? JSON.stringify(updates.narrative_context)
          : (existing.narrative_context ? JSON.stringify(existing.narrative_context) : ""),
        multi_agent_context_json: updates.multi_agent_context
          ? JSON.stringify(updates.multi_agent_context)
          : (existing.multi_agent_context ? JSON.stringify(existing.multi_agent_context) : ""),
        social_context_json: updates.social_context
          ? JSON.stringify(updates.social_context)
          : (existing.social_context ? JSON.stringify(existing.social_context) : ""),
      },
    ],
  }));
}

/**
 * Mark a memory as superseded by a newer memory
 */
export async function supersedeMemory(oldId: string, newId: string): Promise<void> {
  if (!memoriesCollection) await initDb();

  // Mark old memory as superseded
  const oldMemory = await getMemory(oldId);
  if (oldMemory) {
    await updateMemory(oldId, {
      superseded_by: newId,
      valid_until: new Date().toISOString(),
    });
  }

  // Mark new memory as superseding
  const newMemory = await getMemory(newId);
  if (newMemory) {
    await updateMemory(newId, {
      supersedes: oldId,
      valid_from: new Date().toISOString(),
    });
  }
}

export async function deleteMemory(id: string): Promise<void> {
  if (!memoriesCollection) await initDb();
  await withRetry(() => memoriesCollection!.delete({ ids: [id] }));
}

export async function listMemories(options: {
  limit?: number;
  project?: string;
  type?: MemoryType;
  sortBy?: "recent" | "importance" | "accessed";
} = {}): Promise<Memory[]> {
  if (!memoriesCollection) await initDb();

  const { limit = 50, project, type, sortBy = "recent" } = options;

  const whereConditions: any[] = [];
  if (project) whereConditions.push({ project });
  if (type) whereConditions.push({ type });

  const whereClause =
    whereConditions.length > 1
      ? { $and: whereConditions }
      : whereConditions[0] || undefined;

  const results = await withRetry(() => memoriesCollection!.get({
    limit,
    where: whereClause,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  }));

  if (!results.ids.length) return [];

  let memories = results.ids.map((id, i) =>
    parseMemoryFromChroma(
      id,
      results.documents?.[i] || "",
      results.metadatas?.[i] || {}
    )
  );

  // Sort
  switch (sortBy) {
    case "importance":
      memories.sort((a, b) => b.importance - a.importance);
      break;
    case "accessed":
      memories.sort(
        (a, b) =>
          new Date(b.last_accessed || 0).getTime() -
          new Date(a.last_accessed || 0).getTime()
      );
      break;
    case "recent":
    default:
      memories.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }

  return memories.slice(0, limit);
}

/**
 * Get all memories with their embeddings for graph analysis
 * Used by graph enrichment to compute similarity
 */
export async function getAllMemoriesWithEmbeddings(): Promise<
  Array<Memory & { embedding: number[] }>
> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    include: [
      IncludeEnum.Documents,
      IncludeEnum.Metadatas,
      IncludeEnum.Embeddings,
    ],
  });

  if (!results.ids.length) return [];

  return results.ids.map((id, i) =>
    parseMemoryFromChroma(
      id,
      results.documents?.[i] || "",
      results.metadatas?.[i] || {},
      { embedding: (results.embeddings?.[i] || []) as number[] }
    ) as Memory & { embedding: number[] }
  );
}

/**
 * Add a rich link to a memory
 */
export async function addMemoryLink(
  memoryId: string,
  link: {
    targetId: string;
    type: string;
    reason?: string;
    strength?: number;
    createdBy?: string;
  }
): Promise<void> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [memoryId],
    include: [IncludeEnum.Metadatas],
  });

  if (!results.ids.length) {
    throw new Error(`Memory ${memoryId} not found`);
  }

  const metadata = results.metadatas?.[0] || {};

  // Parse existing links JSON or initialize empty array
  let existingLinks: any[] = [];
  if (metadata.links_json) {
    try {
      existingLinks = JSON.parse(metadata.links_json as string);
    } catch {
      existingLinks = [];
    }
  }

  // Check for duplicate link
  const isDuplicate = existingLinks.some(
    (l) => l.targetId === link.targetId && l.type === link.type
  );

  if (!isDuplicate) {
    existingLinks.push({
      ...link,
      createdAt: new Date().toISOString(),
    });

    await memoriesCollection!.update({
      ids: [memoryId],
      metadatas: [
        {
          ...metadata,
          links_json: JSON.stringify(existingLinks),
          // Also update simple related_memories for backward compat
          related_memories: [
            ...new Set([
              ...((metadata.related_memories as string) || "")
                .split(",")
                .filter(Boolean),
              link.targetId,
            ]),
          ].join(","),
        },
      ],
    });
  }
}

export async function getMemoryStats(): Promise<{
  total: number;
  byType: Record<MemoryType, number>;
  byProject: Record<string, number>;
  recentCount: number;
}> {
  if (!memoriesCollection) await initDb();

  const allMemories = await withRetry(() => memoriesCollection!.get({
    include: [IncludeEnum.Metadatas],
  }));

  const stats = {
    total: allMemories.ids.length,
    byType: {} as Record<MemoryType, number>,
    byProject: {} as Record<string, number>,
    recentCount: 0,
  };

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  allMemories.metadatas?.forEach((metadata) => {
    const type = (metadata?.type as MemoryType) || "context";
    const project = (metadata?.project as string) || "unassigned";
    const timestamp = new Date(metadata?.timestamp as string || 0).getTime();

    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.byProject[project] = (stats.byProject[project] || 0) + 1;

    if (timestamp > weekAgo) stats.recentCount++;
  });

  return stats;
}

// ============ SESSION OPERATIONS ============

/**
 * Current session state.
 *
 * ARCHITECTURE NOTE: MCP servers are single-instance per Claude session.
 * Each server process handles exactly one Claude conversation, so global
 * session state is acceptable and thread-safe in Node.js's single-threaded
 * event loop.
 *
 * For testing or advanced use cases, session ID can be overridden via
 * setSessionId() or startSession().
 */
let currentSessionId: string | null = null;

/**
 * Get the current session ID, lazily initializing if needed.
 * Synchronous and safe in Node.js single-threaded context.
 */
export function getCurrentSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = generateId("sess");
    console.error(`Auto-initialized session: ${currentSessionId}`);
  }
  return currentSessionId;
}

/**
 * Set session ID explicitly (for testing or external session management).
 * Use this to override the default lazy initialization.
 */
export function setSessionId(sessionId: string): void {
  if (currentSessionId && currentSessionId !== sessionId) {
    console.error(`Warning: Changing session ID from ${currentSessionId} to ${sessionId}`);
  }
  currentSessionId = sessionId;
}

export async function startSession(project?: string): Promise<string> {
  if (!sessionsCollection) await initDb();

  currentSessionId = generateId("sess");

  await sessionsCollection!.add({
    ids: [currentSessionId],
    documents: [""],
    embeddings: [[0]], // Placeholder embedding
    metadatas: [
      {
        project: project || config.current_project || "",
        started_at: new Date().toISOString(),
        ended_at: "",
        summary: "",
        memory_ids: "",
      },
    ],
  });

  return currentSessionId;
}

export async function endSession(summary?: string): Promise<void> {
  if (!sessionsCollection || !currentSessionId) return;

  const results = await sessionsCollection!.get({
    ids: [currentSessionId],
    include: [IncludeEnum.Metadatas],
  });

  if (results.ids.length) {
    const metadata = results.metadatas?.[0] || {};

    await sessionsCollection!.update({
      ids: [currentSessionId],
      metadatas: [
        {
          ...metadata,
          ended_at: new Date().toISOString(),
          summary: summary || "",
        },
      ],
    });
  }

  currentSessionId = null;
}

export async function addMemoryToSession(memoryId: string): Promise<void> {
  if (!sessionsCollection || !currentSessionId) return;

  const results = await sessionsCollection!.get({
    ids: [currentSessionId],
    include: [IncludeEnum.Metadatas],
  });

  if (results.ids.length) {
    const metadata = results.metadatas?.[0] || {};
    const existingIds = ((metadata.memory_ids as string) || "")
      .split(",")
      .filter(Boolean);

    await sessionsCollection!.update({
      ids: [currentSessionId],
      metadatas: [
        {
          ...metadata,
          memory_ids: [...existingIds, memoryId].join(","),
        },
      ],
    });
  }
}

// ============ PROJECT OPERATIONS ============

export async function setProject(
  name: string,
  description?: string,
  techStack?: string[]
): Promise<void> {
  if (!projectsCollection) await initDb();

  const existing = await projectsCollection!.get({
    ids: [name],
  });

  const now = new Date().toISOString();

  if (existing.ids.length) {
    await projectsCollection!.update({
      ids: [name],
      metadatas: [
        {
          description: description || "",
          tech_stack: (techStack || []).join(","),
          created_at: (existing.metadatas?.[0]?.created_at as string) || now,
          last_active: now,
        },
      ],
    });
  } else {
    await projectsCollection!.add({
      ids: [name],
      documents: [description || ""],
      embeddings: [[0]],
      metadatas: [
        {
          description: description || "",
          tech_stack: (techStack || []).join(","),
          created_at: now,
          last_active: now,
        },
      ],
    });
  }
}

export async function listProjects(): Promise<ProjectContext[]> {
  if (!projectsCollection) await initDb();

  const results = await projectsCollection!.get({
    include: [IncludeEnum.Metadatas],
  });

  return results.ids.map((name, i) => {
    const metadata = results.metadatas?.[i] || {};
    return {
      name,
      description: (metadata.description as string) || undefined,
      tech_stack: ((metadata.tech_stack as string) || "")
        .split(",")
        .filter(Boolean),
      conventions: [],
      created_at: (metadata.created_at as string) || "",
      last_active: (metadata.last_active as string) || "",
    };
  });
}

// ============ DEDUPLICATION ============

export async function findSimilarMemories(
  content: string,
  threshold: number = DB.DEFAULT_SIMILAR_THRESHOLD
): Promise<Memory[]> {
  const results = await searchMemories(content, { limit: 5 });
  return results.filter((m) => m.score >= threshold);
}

export async function consolidateMemories(
  ids: string[],
  mergedContent: string,
  keepMetadataFrom: string,
  overrides?: {
    tags?: string[];
    importance?: number;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  const sourceMemory = await getMemory(keepMetadataFrom);
  if (!sourceMemory) throw new Error("Source memory not found");

  // Create consolidated memory
  const newId = await saveMemory({
    content: mergedContent,
    type: sourceMemory.type,
    tags: overrides?.tags || sourceMemory.tags,
    timestamp: new Date().toISOString(),
    project: sourceMemory.project,
    importance: overrides?.importance || Math.max(sourceMemory.importance, 4), // Boost importance
    related_memories: ids,
    metadata: overrides?.metadata,
  });

  // Delete old memories
  for (const id of ids) {
    if (id !== keepMetadataFrom) {
      await deleteMemory(id);
    }
  }

  return newId;
}

// ============ MEMORY LINK OPERATIONS ============

/**
 * Get all links for a memory (parses links_json from metadata)
 */
export async function getMemoryLinks(memoryId: string): Promise<Array<{
  targetId: string;
  type: string;
  reason?: string;
  strength?: number;
  createdBy?: string;
  createdAt?: string;
}>> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [memoryId],
    include: [IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return [];

  const metadata = results.metadatas?.[0] || {};

  if (metadata.links_json) {
    try {
      return JSON.parse(metadata.links_json as string);
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Remove a specific link from a memory
 */
export async function removeMemoryLink(
  memoryId: string,
  targetId: string,
  linkType?: string
): Promise<boolean> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [memoryId],
    include: [IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return false;

  const metadata = results.metadatas?.[0] || {};
  let links: any[] = [];

  if (metadata.links_json) {
    try {
      links = JSON.parse(metadata.links_json as string);
    } catch {
      links = [];
    }
  }

  const originalLength = links.length;
  links = links.filter(l => {
    if (l.targetId !== targetId) return true;
    if (linkType && l.type !== linkType) return true;
    return false;
  });

  if (links.length === originalLength) return false;

  // Also update simple related_memories
  let relatedMemories = ((metadata.related_memories as string) || "").split(",").filter(Boolean);
  relatedMemories = relatedMemories.filter(id => id !== targetId);

  await memoriesCollection!.update({
    ids: [memoryId],
    metadatas: [{
      ...metadata,
      links_json: JSON.stringify(links),
      related_memories: relatedMemories.join(","),
    }],
  });

  return true;
}
