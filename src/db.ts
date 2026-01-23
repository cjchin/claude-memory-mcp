import { ChromaClient, Collection, IncludeEnum } from "chromadb";
import { embed } from "./embeddings.js";
import { config } from "./config.js";
import type { Memory, MemoryType, MemoryLayer, Session, ProjectContext } from "./types.js";

const MEMORIES_COLLECTION = "claude_memories";
const SESSIONS_COLLECTION = "claude_sessions";
const PROJECTS_COLLECTION = "claude_projects";

let client: ChromaClient | null = null;
let memoriesCollection: Collection | null = null;
let sessionsCollection: Collection | null = null;
let projectsCollection: Collection | null = null;

export async function initDb(): Promise<void> {
  if (!client) {
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
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ MEMORY OPERATIONS ============

export async function saveMemory(
  memory: Omit<Memory, "id" | "access_count">
): Promise<string> {
  if (!memoriesCollection) await initDb();

  const id = generateId("mem");
  const embedding = await embed(memory.content);

  await memoriesCollection!.add({
    ids: [id],
    embeddings: [embedding],
    documents: [memory.content],
    metadatas: [
      {
        type: memory.type,
        tags: memory.tags.join(","),
        timestamp: memory.timestamp,
        project: memory.project || "",
        session_id: memory.session_id || "",
        importance: memory.importance,
        access_count: 0,
        last_accessed: "",
        related_memories: memory.related_memories?.join(",") || "",
        metadata_json: memory.metadata ? JSON.stringify(memory.metadata) : "",
        // Soul temporal fields
        layer: memory.layer || "long_term",
        valid_from: memory.valid_from || memory.timestamp,
        valid_until: memory.valid_until || "",
        supersedes: memory.supersedes || "",
        superseded_by: memory.superseded_by || "",
        confidence: memory.confidence ?? 1,
        source: memory.source || "human",
      },
    ],
  });

  return id;
}

export async function searchMemories(
  query: string,
  options: {
    limit?: number;
    types?: MemoryType[];
    tags?: string[];
    project?: string;
    minImportance?: number;
    includeDecayed?: boolean;
  } = {}
): Promise<(Memory & { score: number })[]> {
  if (!memoriesCollection) await initDb();

  const {
    limit = 10,
    types,
    tags,
    project,
    minImportance,
    includeDecayed = false,
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

  const results = await memoriesCollection!.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit * 2, // Fetch extra to filter
    where: whereClause,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
  });

  if (!results.ids[0]?.length) return [];

  let memories = results.ids[0].map((id, i) => {
    const metadata = results.metadatas[0]?.[i] || {};
    const distance = results.distances?.[0]?.[i] || 0;
    const score = 1 - distance; // Convert distance to similarity

    return {
      id,
      content: results.documents[0]?.[i] || "",
      type: (metadata.type as MemoryType) || "context",
      tags: ((metadata.tags as string) || "").split(",").filter(Boolean),
      timestamp: (metadata.timestamp as string) || "",
      project: (metadata.project as string) || undefined,
      session_id: (metadata.session_id as string) || undefined,
      importance: (metadata.importance as number) || 3,
      access_count: (metadata.access_count as number) || 0,
      last_accessed: (metadata.last_accessed as string) || undefined,
      related_memories: ((metadata.related_memories as string) || "")
        .split(",")
        .filter(Boolean),
      metadata: metadata.metadata_json
        ? JSON.parse(metadata.metadata_json as string)
        : undefined,
      // Soul temporal fields
      layer: ((metadata.layer as string) || "long_term") as MemoryLayer,
      valid_from: (metadata.valid_from as string) || undefined,
      valid_until: (metadata.valid_until as string) || undefined,
      supersedes: (metadata.supersedes as string) || undefined,
      superseded_by: (metadata.superseded_by as string) || undefined,
      confidence: (metadata.confidence as number) ?? 1,
      source: ((metadata.source as string) || "human") as Memory["source"],
      score,
    };
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
      const boostFactor = 1 + (m.importance - 3) * 0.1; // Importance boost
      const accessBoost = Math.min(m.access_count * 0.02, 0.2); // Access boost

      return {
        ...m,
        score: m.score * decayFactor * boostFactor + accessBoost,
      };
    });
  }

  // Sort by adjusted score and limit
  return memories
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getMemory(id: string): Promise<Memory | null> {
  if (!memoriesCollection) await initDb();

  const results = await memoriesCollection!.get({
    ids: [id],
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return null;

  const metadata = results.metadatas?.[0] || {};

  // Update access tracking
  await memoriesCollection!.update({
    ids: [id],
    metadatas: [
      {
        ...metadata,
        access_count: ((metadata.access_count as number) || 0) + 1,
        last_accessed: new Date().toISOString(),
      },
    ],
  });

  return {
    id,
    content: results.documents?.[0] || "",
    type: (metadata.type as MemoryType) || "context",
    tags: ((metadata.tags as string) || "").split(",").filter(Boolean),
    timestamp: (metadata.timestamp as string) || "",
    project: (metadata.project as string) || undefined,
    session_id: (metadata.session_id as string) || undefined,
    importance: (metadata.importance as number) || 3,
    access_count: ((metadata.access_count as number) || 0) + 1,
    last_accessed: new Date().toISOString(),
    related_memories: ((metadata.related_memories as string) || "")
      .split(",")
      .filter(Boolean),
    // Soul temporal fields
    layer: ((metadata.layer as string) || "long_term") as MemoryLayer,
    valid_from: (metadata.valid_from as string) || undefined,
    valid_until: (metadata.valid_until as string) || undefined,
    supersedes: (metadata.supersedes as string) || undefined,
    superseded_by: (metadata.superseded_by as string) || undefined,
    confidence: (metadata.confidence as number) ?? 1,
    source: ((metadata.source as string) || "human") as Memory["source"],
  };
}

export async function updateMemory(
  id: string,
  updates: Partial<Omit<Memory, "id">>
): Promise<void> {
  if (!memoriesCollection) await initDb();

  const existing = await getMemory(id);
  if (!existing) throw new Error(`Memory ${id} not found`);

  const newContent = updates.content || existing.content;
  const embedding = updates.content ? await embed(newContent) : undefined;

  await memoriesCollection!.update({
    ids: [id],
    embeddings: embedding ? [embedding] : undefined,
    documents: updates.content ? [newContent] : undefined,
    metadatas: [
      {
        type: updates.type || existing.type,
        tags: (updates.tags || existing.tags).join(","),
        timestamp: existing.timestamp,
        project: updates.project ?? existing.project ?? "",
        session_id: existing.session_id || "",
        importance: updates.importance ?? existing.importance,
        access_count: existing.access_count,
        last_accessed: existing.last_accessed || "",
        related_memories: (updates.related_memories || existing.related_memories || []).join(","),
        // Soul temporal fields
        layer: updates.layer || existing.layer || "long_term",
        valid_from: updates.valid_from || existing.valid_from || existing.timestamp,
        valid_until: updates.valid_until || existing.valid_until || "",
        supersedes: updates.supersedes || existing.supersedes || "",
        superseded_by: updates.superseded_by || existing.superseded_by || "",
        confidence: updates.confidence ?? existing.confidence ?? 1,
        source: updates.source || existing.source || "human",
      },
    ],
  });
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
  await memoriesCollection!.delete({ ids: [id] });
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

  const results = await memoriesCollection!.get({
    limit,
    where: whereClause,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
  });

  if (!results.ids.length) return [];

  let memories = results.ids.map((id, i) => {
    const metadata = results.metadatas?.[i] || {};
    return {
      id,
      content: results.documents?.[i] || "",
      type: (metadata.type as MemoryType) || "context",
      tags: ((metadata.tags as string) || "").split(",").filter(Boolean),
      timestamp: (metadata.timestamp as string) || "",
      project: (metadata.project as string) || undefined,
      session_id: (metadata.session_id as string) || undefined,
      importance: (metadata.importance as number) || 3,
      access_count: (metadata.access_count as number) || 0,
      last_accessed: (metadata.last_accessed as string) || undefined,
      related_memories: ((metadata.related_memories as string) || "")
        .split(",")
        .filter(Boolean),
      // Soul temporal fields
      layer: ((metadata.layer as string) || "long_term") as MemoryLayer,
      valid_from: (metadata.valid_from as string) || undefined,
      valid_until: (metadata.valid_until as string) || undefined,
      supersedes: (metadata.supersedes as string) || undefined,
      superseded_by: (metadata.superseded_by as string) || undefined,
      confidence: (metadata.confidence as number) ?? 1,
      source: ((metadata.source as string) || "human") as Memory["source"],
    };
  });

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

export async function getMemoryStats(): Promise<{
  total: number;
  byType: Record<MemoryType, number>;
  byProject: Record<string, number>;
  recentCount: number;
}> {
  if (!memoriesCollection) await initDb();

  const allMemories = await memoriesCollection!.get({
    include: [IncludeEnum.Metadatas],
  });

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

let currentSessionId: string | null = null;

export function getCurrentSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = generateId("sess");
  }
  return currentSessionId;
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
  threshold: number = 0.85
): Promise<Memory[]> {
  const results = await searchMemories(content, { limit: 5 });
  return results.filter((m) => m.score >= threshold);
}

export async function consolidateMemories(
  ids: string[],
  mergedContent: string,
  keepMetadataFrom: string
): Promise<string> {
  const sourceMemory = await getMemory(keepMetadataFrom);
  if (!sourceMemory) throw new Error("Source memory not found");

  // Create consolidated memory
  const newId = await saveMemory({
    content: mergedContent,
    type: sourceMemory.type,
    tags: sourceMemory.tags,
    timestamp: new Date().toISOString(),
    project: sourceMemory.project,
    importance: Math.max(sourceMemory.importance, 4), // Boost importance
    related_memories: ids,
  });

  // Delete old memories
  for (const id of ids) {
    if (id !== keepMetadataFrom) {
      await deleteMemory(id);
    }
  }

  return newId;
}
