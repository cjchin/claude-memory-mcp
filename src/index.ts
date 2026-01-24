import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initEmbeddings } from "./embeddings.js";
import {
  initDb,
  saveMemory,
  searchMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  listMemories,
  getMemoryStats,
  startSession,
  endSession,
  getCurrentSessionId,
  addMemoryToSession,
  setProject,
  listProjects,
  findSimilarMemories,
  consolidateMemories,
} from "./db.js";
import { config, updateConfig } from "./config.js";
import {
  detectMemoryType,
  detectTags,
  estimateImportance,
  generateSessionSummary,
} from "./intelligence.js";
import {
  detectTrigger,
  extractMemorablePoints,
  createAlignmentReportTemplate,
  detectClaudeInsights,
  analyzeConversationTurn,
  detectSemanticSignal,
  type TriggerMatch,
} from "./autonomous.js";
import { cleanText, extractEntities, extractReasoning } from "./preprocess.js";
import { SmartAlignmentEngine, type AlignmentResult, type MemoryCandidate } from "./alignment.js";
import { MEMORY_TYPE_DESCRIPTIONS, type MemoryType } from "./types.js";
import { introspect as runIntrospection, hasCapability, getFeatureStatus, loadManifest } from "./introspect.js";

const server = new McpServer({
  name: "claude-memory",
  version: "1.0.0",
});

// Shared alignment engine instance
const alignmentEngine = new SmartAlignmentEngine({
  autoSaveEnabled: true,
  userTriggerThreshold: 0.7,
  claudeInsightThreshold: 0.75,
});

// ============ MEMORY TOOLS ============

// Save a memory with auto-detection
server.tool(
  "remember",
  {
    content: z.string().describe("The insight, decision, pattern, or context to remember"),
    type: z
      .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference"])
      .optional()
      .describe("Memory type (auto-detected if not specified)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization (auto-detected if not specified)"),
    importance: z.number().min(1).max(5).optional().describe("Importance 1-5 (auto-detected if not specified)"),
    project: z.string().optional().describe("Project name (uses current project if not specified)"),
    scope: z.enum(["personal", "team", "project"]).optional().describe("Memory scope: personal (default), team, or project"),
    owner: z.string().optional().describe("Owner identifier (user or agent ID)"),
    related_to: z.array(z.string()).optional().describe("IDs of related memories (creates bidirectional links)"),
  },
  async ({ content, type, tags, importance, project, scope, owner, related_to }) => {
    // Preprocess the content
    const cleanedContent = cleanText(content);
    const extractedEntities = extractEntities(content);
    const extractedReasoning = extractReasoning(content);
    
    // Check for duplicates first
    const similar = await findSimilarMemories(cleanedContent, 0.9);
    if (similar.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Warning: Very similar memory already exists:\n"${similar[0].content.slice(0, 100)}..."\n\nMemory not saved. Use update_memory to modify existing, or rephrase to save as new.`,
          },
        ],
      };
    }

    // Auto-detect if not specified
    const detectedType = type || detectMemoryType(content);
    const detectedTags = tags?.length ? tags : detectTags(content);
    const detectedImportance = importance ?? estimateImportance(content);
    
    // Merge extracted entities into tags
    const mergedTags = [...new Set([...detectedTags, ...extractedEntities])];

    const now = new Date().toISOString();
    const id = await saveMemory({
      content: cleanedContent,
      type: detectedType,
      tags: mergedTags,
      importance: detectedImportance,
      project: project || config.current_project,
      session_id: getCurrentSessionId(),
      timestamp: now,              // Event time
      ingestion_time: now,         // Ingestion time (bi-temporal)
      valid_from: now,
      source: "human",
      scope: scope || "personal",  // Memory scope (from Mem0)
      owner: owner,                // Owner identifier
      related_memories: related_to, // Bidirectional linking
      // Store extracted reasoning in metadata
      metadata: extractedReasoning ? { reasoning: extractedReasoning } : undefined,
    });

    await addMemoryToSession(id);

    const scopeInfo = scope && scope !== "personal" ? `\nScope: ${scope}` : "";
    const linkedInfo = related_to?.length ? `\nLinked to: ${related_to.join(", ")}` : "";

    return {
      content: [
        {
          type: "text" as const,
          text: `Saved memory [${id}]\nType: ${detectedType}\nTags: ${mergedTags.join(", ") || "none"}\nImportance: ${detectedImportance}/5${scopeInfo}${linkedInfo}${extractedEntities.length ? `\nExtracted entities: ${extractedEntities.join(", ")}` : ""}`,
        },
      ],
    };
  }
);

// Semantic search with optional hybrid mode
server.tool(
  "recall",
  {
    query: z.string().describe("What to search for (semantic search)"),
    limit: z.number().optional().default(5).describe("Max results"),
    types: z
      .array(z.enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference"]))
      .optional()
      .describe("Filter by memory types"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    project: z.string().optional().describe("Filter by project"),
    min_importance: z.number().min(1).max(5).optional().describe("Minimum importance level"),
    hybrid: z.boolean().optional().describe("Enable hybrid search (BM25 + semantic + graph)"),
    expand_graph: z.boolean().optional().describe("Include connected memories in results"),
  },
  async ({ query, limit, types, tags, project, min_importance, hybrid, expand_graph }) => {
    const memories = await searchMemories(query, {
      limit,
      types: types as MemoryType[] | undefined,
      tags,
      project: project || config.current_project,
      minImportance: min_importance,
      useHybrid: hybrid,
      expandGraph: expand_graph,
    });

    if (memories.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No relevant memories found." }],
      };
    }

    const formatted = memories
      .map((m: any, i: number) => {
        // Check if this is a hybrid search result with detailed scores
        const isHybrid = m.semanticScore !== undefined;
        const isGraphExpansion = m._isGraphExpansion;

        let scoreInfo = `${Math.round(m.score * 100)}% match`;
        if (isHybrid) {
          scoreInfo = `score: ${Math.round(m.score * 100)}% ` +
            `(sem: ${Math.round(m.semanticScore * 100)}%, ` +
            `bm25: ${Math.round(m.bm25Score * 100)}%` +
            (m.graphBoost > 0 ? `, graph: +${Math.round(m.graphBoost * 100)}%` : "") +
            `)`;
        }
        if (isGraphExpansion) {
          scoreInfo = `🔗 graph neighbor (distance: ${m.graphDistance})`;
        }

        return (
          `[${i + 1}] ${m.type.toUpperCase()} (${scoreInfo}, importance: ${m.importance}/5)\n` +
          `ID: ${m.id}\n` +
          `Tags: ${m.tags.join(", ") || "none"}\n` +
          `Project: ${m.project || "unassigned"}` +
          (m.scope && m.scope !== "personal" ? ` | Scope: ${m.scope}` : "") + `\n` +
          `Date: ${m.timestamp}` +
          (m.ingestion_time && m.ingestion_time !== m.timestamp ? ` (ingested: ${m.ingestion_time})` : "") + `\n` +
          (m.related_memories?.length ? `Links: ${m.related_memories.join(", ")}\n` : "") +
          `${m.content}`
        );
      })
      .join("\n\n---\n\n");

    const modeInfo = hybrid ? " (hybrid: semantic + BM25 + graph)" : "";
    const graphInfo = expand_graph ? ` [graph expansion enabled]` : "";

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${memories.length} relevant memories${modeInfo}${graphInfo}:\n\n${formatted}`,
        },
      ],
    };
  }
);

// Get full memory by ID
server.tool(
  "get_memory",
  {
    id: z.string().describe("Memory ID"),
  },
  async ({ id }) => {
    const memory = await getMemory(id);

    if (!memory) {
      return {
        content: [{ type: "text" as const, text: `Memory ${id} not found.` }],
      };
    }

    const linksInfo = memory.related_memories?.length
      ? `\nLinked to: ${memory.related_memories.join(", ")}`
      : "";
    const scopeInfo = memory.scope && memory.scope !== "personal"
      ? `\nScope: ${memory.scope}`
      : "";
    const ownerInfo = memory.owner
      ? `\nOwner: ${memory.owner}`
      : "";
    const ingestionInfo = memory.ingestion_time && memory.ingestion_time !== memory.timestamp
      ? `\nIngested: ${memory.ingestion_time}`
      : "";

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Memory: ${memory.id}\n` +
            `Type: ${memory.type}\n` +
            `Tags: ${memory.tags.join(", ")}\n` +
            `Importance: ${memory.importance}/5\n` +
            `Project: ${memory.project || "unassigned"}` +
            scopeInfo + ownerInfo + `\n` +
            `Created: ${memory.timestamp}` + ingestionInfo + `\n` +
            `Accessed: ${memory.access_count} times\n` +
            `Last accessed: ${memory.last_accessed || "never"}` +
            linksInfo + `\n\n` +
            `Content:\n${memory.content}`,
        },
      ],
    };
  }
);

// Update memory
server.tool(
  "update_memory",
  {
    id: z.string().describe("Memory ID to update"),
    content: z.string().optional().describe("New content"),
    type: z
      .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference"])
      .optional(),
    tags: z.array(z.string()).optional(),
    importance: z.number().min(1).max(5).optional(),
  },
  async ({ id, content, type, tags, importance }) => {
    await updateMemory(id, { content, type, tags, importance });
    return {
      content: [{ type: "text" as const, text: `Updated memory ${id}` }],
    };
  }
);

// Delete memory
server.tool(
  "forget",
  {
    id: z.string().describe("Memory ID to delete"),
  },
  async ({ id }) => {
    await deleteMemory(id);
    return {
      content: [{ type: "text" as const, text: `Deleted memory ${id}` }],
    };
  }
);

// List memories
server.tool(
  "list_memories",
  {
    limit: z.number().optional().default(20),
    project: z.string().optional(),
    type: z
      .enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference"])
      .optional(),
    sort_by: z.enum(["recent", "importance", "accessed"]).optional().default("recent"),
  },
  async ({ limit, project, type, sort_by }) => {
    const memories = await listMemories({
      limit,
      project: project || config.current_project,
      type: type as MemoryType | undefined,
      sortBy: sort_by,
    });

    if (memories.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No memories found." }],
      };
    }

    const formatted = memories
      .map(
        (m) =>
          `- [${m.id}] ${m.type} (imp: ${m.importance}) ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`
      )
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Memories (${memories.length}):\n\n${formatted}`,
        },
      ],
    };
  }
);

// Memory statistics
server.tool("memory_stats", {}, async () => {
  const stats = await getMemoryStats();

  const typeBreakdown = Object.entries(stats.byType)
    .map(([type, count]) => `  ${type}: ${count}`)
    .join("\n");

  const projectBreakdown = Object.entries(stats.byProject)
    .map(([project, count]) => `  ${project || "unassigned"}: ${count}`)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text:
          `Memory Statistics\n` +
          `=================\n\n` +
          `Total memories: ${stats.total}\n` +
          `Added this week: ${stats.recentCount}\n\n` +
          `By type:\n${typeBreakdown}\n\n` +
          `By project:\n${projectBreakdown}`,
      },
    ],
  };
});

// ============ ALIGNMENT TOOLS ============

// Analyze conversation for automatic memory extraction
server.tool(
  "analyze_conversation",
  {
    user_message: z.string().describe("The user's message in the conversation"),
    claude_response: z.string().describe("Claude's response to analyze for insights"),
    auto_save: z.boolean().optional().describe("Automatically save detected memories (default: false)"),
  },
  async ({ user_message, claude_response, auto_save = false }) => {
    const result = alignmentEngine.analyze(user_message, claude_response);
    
    let savedIds: string[] = [];
    
    if (auto_save && result.memoriesToCreate.length > 0) {
      for (const candidate of result.memoriesToCreate) {
        // Check for duplicates
        const similar = await findSimilarMemories(candidate.content, 0.9);
        if (similar.length > 0) continue;
        
        const id = await saveMemory({
          content: candidate.content,
          type: candidate.type,
          tags: candidate.tags,
          importance: candidate.importance,
          project: config.current_project,
          session_id: getCurrentSessionId(),
          timestamp: new Date().toISOString(),
          valid_from: new Date().toISOString(),
          source: candidate.source === 'claude' ? 'inferred' : 'human',
          confidence: candidate.confidence,
        });
        savedIds.push(id);
        await addMemoryToSession(id);
      }
    }
    
    // Format the response
    const memorySummary = result.memoriesToCreate.map((m, i) => 
      `${i + 1}. [${m.type}] ${m.content.slice(0, 80)}... (conf: ${Math.round(m.confidence * 100)}%, src: ${m.source})`
    ).join('\n');
    
    const recallSummary = result.recallQueries.length > 0 
      ? `\nRecall queries: ${result.recallQueries.join(', ')}`
      : '';
    
    const savedSummary = savedIds.length > 0
      ? `\n\nAuto-saved ${savedIds.length} memories: ${savedIds.join(', ')}`
      : '';
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Analysis: ${result.explanation}\n\n` +
            `Memories detected (${result.memoriesToCreate.length}):\n${memorySummary || 'None'}` +
            recallSummary +
            (result.needsAlignment ? `\n\nAlignment needed for: ${result.alignmentTopic}` : '') +
            savedSummary,
        },
      ],
    };
  }
);

// Quick alignment check - returns what should be remembered from the last exchange
server.tool(
  "what_to_remember",
  {
    exchange: z.string().describe("The conversation exchange to analyze"),
  },
  async ({ exchange }) => {
    // Split exchange into user/claude if possible, otherwise analyze as user message
    const parts = exchange.split(/(?:claude:|assistant:|AI:)/i);
    const userPart = parts[0]?.trim() || exchange;
    const claudePart = parts[1]?.trim() || '';
    
    const result = alignmentEngine.analyze(userPart, claudePart);
    
    if (result.memoriesToCreate.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No memorable content detected in this exchange.",
          },
        ],
      };
    }
    
    const suggestions = result.memoriesToCreate.map((m, i) =>
      `${i + 1}. **${m.type}**: ${m.content}\n   Tags: ${m.tags.join(', ')} | Importance: ${m.importance}/5`
    ).join('\n\n');
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Suggested memories to save:\n\n${suggestions}`,
        },
      ],
    };
  }
);

// ============ SESSION TOOLS ============

server.tool(
  "start_session",
  {
    project: z.string().optional().describe("Project for this session"),
  },
  async ({ project }) => {
    const sessionId = await startSession(project);

    if (project) {
      updateConfig({ current_project: project });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Started session ${sessionId}${project ? ` for project: ${project}` : ""}`,
        },
      ],
    };
  }
);

server.tool(
  "end_session",
  {
    summarize: z.boolean().optional().default(true).describe("Generate session summary"),
  },
  async ({ summarize }) => {
    const sessionId = getCurrentSessionId();

    let summaryText = "";
    if (summarize) {
      // Get memories from this session
      const memories = await listMemories({ limit: 100 });
      const sessionMemories = memories.filter((m) => m.session_id === sessionId);

      if (sessionMemories.length >= config.session_summary_min_memories) {
        summaryText = generateSessionSummary(sessionMemories);

        // Save summary as a memory
        await saveMemory({
          content: `Session summary (${sessionId}):\n${summaryText}`,
          type: "summary",
          tags: ["session-summary"],
          importance: 3,
          project: config.current_project,
          timestamp: new Date().toISOString(),
        });
      }
    }

    await endSession(summaryText);

    return {
      content: [
        {
          type: "text" as const,
          text: `Ended session ${sessionId}${summaryText ? `\n\nSummary:\n${summaryText}` : ""}`,
        },
      ],
    };
  }
);

// ============ PROJECT TOOLS ============

server.tool(
  "set_project",
  {
    name: z.string().describe("Project name"),
    description: z.string().optional(),
    tech_stack: z.array(z.string()).optional(),
  },
  async ({ name, description, tech_stack }) => {
    await setProject(name, description, tech_stack);
    updateConfig({ current_project: name });

    return {
      content: [
        {
          type: "text" as const,
          text: `Set current project to: ${name}`,
        },
      ],
    };
  }
);

server.tool("list_projects", {}, async () => {
  const projects = await listProjects();

  if (projects.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No projects defined." }],
    };
  }

  const formatted = projects
    .map(
      (p) =>
        `- ${p.name}${p.name === config.current_project ? " (current)" : ""}\n` +
        `  ${p.description || "No description"}\n` +
        `  Tech: ${p.tech_stack?.join(", ") || "Not specified"}\n` +
        `  Last active: ${p.last_active}`
    )
    .join("\n\n");

  return {
    content: [{ type: "text" as const, text: `Projects:\n\n${formatted}` }],
  };
});

// ============ UTILITY TOOLS ============

server.tool(
  "merge_memories",
  {
    ids: z.array(z.string()).min(2).describe("Memory IDs to merge"),
    merged_content: z.string().describe("The consolidated content"),
    keep_metadata_from: z.string().describe("ID of memory whose metadata to keep"),
  },
  async ({ ids, merged_content, keep_metadata_from }) => {
    const newId = await consolidateMemories(ids, merged_content, keep_metadata_from);
    return {
      content: [
        {
          type: "text" as const,
          text: `Merged ${ids.length} memories into ${newId}`,
        },
      ],
    };
  }
);

server.tool(
  "find_similar",
  {
    content: z.string().describe("Content to find similar memories for"),
    threshold: z.number().min(0).max(1).optional().default(0.7),
  },
  async ({ content, threshold }) => {
    const similar = await findSimilarMemories(content, threshold);

    if (similar.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No similar memories found." }],
      };
    }

    const formatted = similar
      .map((m: any) => `- [${m.id}] (${Math.round(m.score * 100)}% similar) ${m.content.slice(0, 100)}...`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Similar memories:\n\n${formatted}`,
        },
      ],
    };
  }
);

// Memory type help
server.tool("memory_types", {}, async () => {
  const types = Object.entries(MEMORY_TYPE_DESCRIPTIONS)
    .map(([type, desc]) => `- ${type}: ${desc}`)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text: `Available memory types:\n\n${types}`,
      },
    ],
  };
});

// Health check / status
server.tool("soul_status", {}, async () => {
  const stats = await getMemoryStats();
  const sessionId = getCurrentSessionId();

  return {
    content: [
      {
        type: "text" as const,
        text:
          `Digital Soul Status: ONLINE\n` +
          `========================\n\n` +
          `Session: ${sessionId}\n` +
          `Current Project: ${config.current_project || "none"}\n` +
          `Total Memories: ${stats.total}\n` +
          `This Week: ${stats.recentCount}\n` +
          `Memory Decay: ${config.enable_memory_decay ? "enabled" : "disabled"}\n` +
          `ChromaDB: ${config.chroma_host}:${config.chroma_port}\n\n` +
          `Soul is ready.`,
      },
    ],
  };
});

// ============ INTROSPECTION - METACOGNITION ============

/**
 * INTROSPECT enables the soul to examine itself:
 * - What capabilities does this vessel have?
 * - What aspirations exist in memory?
 * - What gaps exist between current state and desired state?
 */
server.tool(
  "introspect",
  {
    mode: z.enum(["quick", "full"]).optional().default("quick")
      .describe("quick: manifest + aspirations. full: adds dynamic validation"),
    feature: z.string().optional()
      .describe("Check status of a specific feature by name"),
  },
  async ({ mode, feature }) => {
    // If checking a specific feature
    if (feature) {
      const status = getFeatureStatus(feature);
      if (!status) {
        return {
          content: [{
            type: "text" as const,
            text: `Feature "${feature}" is not in the capabilities manifest.\n\nThis may be:\n- A future aspiration not yet documented\n- A typo in the feature name\n- Something the soul wants but hasn't been planned yet`,
          }],
        };
      }
      
      const manifest = loadManifest();
      const featureData = manifest.features[feature];
      const emoji = status === "implemented" ? "✅" : status === "planned" ? "📋" : status === "partial" ? "🔨" : "⚠️";
      
      return {
        content: [{
          type: "text" as const,
          text: `${emoji} Feature: ${feature}\n` +
            `Status: ${status}\n` +
            `Description: ${featureData.description}\n` +
            (featureData.since ? `Since: v${featureData.since}\n` : "") +
            (featureData.plannedFor ? `Planned for: v${featureData.plannedFor}\n` : ""),
        }],
      };
    }

    // Full introspection
    const result = await runIntrospection(mode);
    
    let text = `🔮 SOUL INTROSPECTION\n${"=".repeat(40)}\n\n`;
    text += result.summary;
    
    text += `\n\n📦 IMPLEMENTED FEATURES (${result.capabilities.implementedFeatures.length}):\n`;
    for (const f of result.capabilities.implementedFeatures) {
      text += `  ✅ ${f}\n`;
    }
    
    if (result.capabilities.plannedFeatures.length > 0) {
      text += `\n📋 PLANNED FEATURES (${result.capabilities.plannedFeatures.length}):\n`;
      for (const f of result.capabilities.plannedFeatures) {
        text += `  📋 ${f}\n`;
      }
    }
    
    text += `\n🛠️ TOOLS (${result.capabilities.tools.length}): ${result.capabilities.tools.join(", ")}\n`;
    text += `\n📚 MODULES (${result.capabilities.modules.length}): ${result.capabilities.modules.join(", ")}\n`;
    
    if (result.aspirations.length > 0) {
      text += `\n💭 ASPIRATIONS FROM MEMORY (${result.aspirations.length}):\n`;
      for (const a of result.aspirations.slice(0, 10)) {
        text += `  • [${a.category}] ${a.content.slice(0, 80)}...\n`;
      }
      if (result.aspirations.length > 10) {
        text += `  ... and ${result.aspirations.length - 10} more\n`;
      }
    }
    
    if (result.gaps.length > 0) {
      text += `\n⚡ GAPS (${result.gaps.length}):\n`;
      for (const g of result.gaps) {
        const emoji = g.status === "planned" ? "📋" : g.status === "partial" ? "🔨" : "❓";
        text += `  ${emoji} ${g.relatedFeature || "untracked"}: ${g.aspiration.slice(0, 60)}...\n`;
      }
    }

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    };
  }
);

// ============ PRIME - AUTONOMOUS CONTEXT LOADING ============

/**
 * PRIME is the central nervous system's activation tool.
 * Call this at the START of every significant session to:
 * - Load relevant project context automatically
 * - Surface pending TODOs
 * - Recall recent decisions and patterns
 * - Provide continuity from previous sessions
 */
server.tool(
  "prime",
  {
    topic: z.string().optional().describe("Optional topic to focus context loading on"),
    depth: z.enum(["quick", "normal", "deep"]).optional().default("normal"),
  },
  async ({ topic, depth }) => {
    const stats = await getMemoryStats();
    const sessionId = getCurrentSessionId();
    const project = config.current_project;

    const sections: string[] = [];

    // Header
    sections.push(
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║              DIGITAL SOUL - CONTEXT PRIMED                  ║\n` +
      `╚══════════════════════════════════════════════════════════════╝\n`
    );

    // Status line
    sections.push(
      `Session: ${sessionId}\n` +
      `Project: ${project || "none"}\n` +
      `Memories: ${stats.total} total, ${stats.recentCount} this week\n`
    );

    const limits = { quick: 3, normal: 5, deep: 10 };
    const limit = limits[depth];

    // 1. PENDING TODOS (always show)
    const todos = await listMemories({
      limit: limit,
      project: project || undefined,
      type: "todo",
      sortBy: "importance",
    });

    if (todos.length > 0) {
      const todoList = todos
        .map((t) => `  □ [${t.importance}★] ${t.content.slice(0, 100)}${t.content.length > 100 ? "..." : ""}`)
        .join("\n");
      sections.push(`\n📋 PENDING TODOS (${todos.length}):\n${todoList}`);
    }

    // 2. RECENT DECISIONS (critical for continuity)
    const decisions = await listMemories({
      limit: limit,
      project: project || undefined,
      type: "decision",
      sortBy: "recent",
    });

    if (decisions.length > 0) {
      const decisionList = decisions
        .map((d) => `  • ${d.content.slice(0, 120)}${d.content.length > 120 ? "..." : ""}`)
        .join("\n");
      sections.push(`\n🎯 RECENT DECISIONS (${decisions.length}):\n${decisionList}`);
    }

    // 3. ACTIVE PATTERNS (how we do things)
    const patterns = await listMemories({
      limit: Math.max(3, limit - 2),
      project: project || undefined,
      type: "pattern",
      sortBy: "importance",
    });

    if (patterns.length > 0) {
      const patternList = patterns
        .map((p) => `  • ${p.content.slice(0, 100)}${p.content.length > 100 ? "..." : ""}`)
        .join("\n");
      sections.push(`\n🔄 ACTIVE PATTERNS (${patterns.length}):\n${patternList}`);
    }

    // 4. TOPIC-SPECIFIC CONTEXT (if topic provided)
    if (topic) {
      const topicMemories = await searchMemories(topic, {
        limit: limit,
        project: project || undefined,
      });

      if (topicMemories.length > 0) {
        const topicList = topicMemories
          .map((m) => `  [${m.type}] ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""} (${Math.round(m.score * 100)}%)`)
          .join("\n");
        sections.push(`\n🎯 CONTEXT FOR "${topic}" (${topicMemories.length}):\n${topicList}`);
      }
    }

    // 5. RECENT LEARNINGS (what we've discovered)
    const learnings = await listMemories({
      limit: Math.max(2, limit - 3),
      project: project || undefined,
      type: "learning",
      sortBy: "recent",
    });

    if (learnings.length > 0) {
      const learningList = learnings
        .map((l) => `  💡 ${l.content.slice(0, 100)}${l.content.length > 100 ? "..." : ""}`)
        .join("\n");
      sections.push(`\n📚 RECENT LEARNINGS (${learnings.length}):\n${learningList}`);
    }

    // Footer with guidance
    sections.push(
      `\n${"─".repeat(60)}\n` +
      `Soul is primed and ready. Context loaded at ${depth} depth.\n` +
      `Use 'align' for deeper topic focus, 'recall' to search memories.`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: sections.join("\n"),
        },
      ],
    };
  }
);

// ============ AUTONOMOUS OPERATIONS ============

/**
 * CONCLUDE - End-of-turn checkpoint
 * A lightweight tool to capture progress after significant work
 * Designed to be called at natural stopping points
 */
server.tool(
  "conclude",
  {
    summary: z.string().describe("Brief summary of what was accomplished"),
    insights: z.array(z.string()).optional().describe("Key insights to remember"),
    next_steps: z.array(z.string()).optional().describe("TODOs or next steps identified"),
    auto_save: z.boolean().optional().default(true),
  },
  async ({ summary, insights, next_steps, auto_save }) => {
    const results: string[] = [];
    const sessionId = getCurrentSessionId();

    results.push(
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║                    CHECKPOINT SAVED                         ║\n` +
      `╚══════════════════════════════════════════════════════════════╝\n`
    );

    // Save summary as a learning/context
    if (auto_save && summary) {
      const summaryId = await saveMemory({
        content: `Session checkpoint: ${summary}`,
        type: "context",
        tags: ["checkpoint", "session-progress"],
        importance: 3,
        project: config.current_project,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
      });
      await addMemoryToSession(summaryId);
      results.push(`📍 Checkpoint: ${summary}`);
      results.push(`   Saved as: ${summaryId}\n`);
    }

    // Save insights as learnings
    if (auto_save && insights?.length) {
      results.push(`💡 Insights saved:`);
      for (const insight of insights) {
        const similar = await findSimilarMemories(insight, 0.85);
        if (similar.length > 0) {
          results.push(`   [SKIP] Already exists: "${insight.slice(0, 40)}..."`);
          continue;
        }

        const id = await saveMemory({
          content: insight,
          type: "learning",
          tags: detectTags(insight),
          importance: estimateImportance(insight),
          project: config.current_project,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        });
        await addMemoryToSession(id);
        results.push(`   • ${insight.slice(0, 50)}... → ${id}`);
      }
      results.push("");
    }

    // Save next steps as TODOs
    if (auto_save && next_steps?.length) {
      results.push(`📋 TODOs added:`);
      for (const step of next_steps) {
        const similar = await findSimilarMemories(step, 0.85);
        if (similar.length > 0) {
          results.push(`   [SKIP] Already exists: "${step.slice(0, 40)}..."`);
          continue;
        }

        const id = await saveMemory({
          content: step,
          type: "todo",
          tags: detectTags(step),
          importance: 4,
          project: config.current_project,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        });
        await addMemoryToSession(id);
        results.push(`   □ ${step.slice(0, 50)}... → ${id}`);
      }
      results.push("");
    }

    results.push(`Session: ${sessionId}`);
    results.push(`Project: ${config.current_project || "none"}`);
    results.push(`\n✓ Checkpoint complete. Soul updated.`);

    return {
      content: [
        {
          type: "text" as const,
          text: results.join("\n"),
        },
      ],
    };
  }
);

// Synthesize: Extract and save key points from a text block
server.tool(
  "synthesize",
  {
    content: z.string().describe("The conversation or text to synthesize into memories"),
    auto_save: z.boolean().optional().default(true).describe("Automatically save extracted points"),
  },
  async ({ content, auto_save }) => {
    const points = extractMemorablePoints(content);

    if (points.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No memorable points detected in the provided content.",
          },
        ],
      };
    }

    const results: string[] = [];

    for (const point of points) {
      if (auto_save) {
        // Check for duplicates
        const similar = await findSimilarMemories(point.content, 0.85);
        if (similar.length > 0) {
          results.push(`[SKIP] Already exists: "${point.content.slice(0, 50)}..."`);
          continue;
        }

        const id = await saveMemory({
          content: point.content,
          type: point.type,
          tags: point.tags,
          importance: point.importance,
          project: config.current_project,
          session_id: getCurrentSessionId(),
          timestamp: new Date().toISOString(),
        });

        await addMemoryToSession(id);
        results.push(`[SAVED] ${point.type.toUpperCase()}: "${point.content.slice(0, 50)}..." → ${id}`);
      } else {
        results.push(`[DETECTED] ${point.type.toUpperCase()} (imp: ${point.importance}): "${point.content.slice(0, 80)}..."`);
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Synthesis Complete\n` +
            `==================\n\n` +
            `Extracted ${points.length} memorable points:\n\n` +
            results.join("\n"),
        },
      ],
    };
  }
);

// Align: Load context for a topic (context priming)
server.tool(
  "align",
  {
    topic: z.string().describe("The topic or area to align with"),
    depth: z.enum(["shallow", "normal", "deep"]).optional().default("normal"),
  },
  async ({ topic, depth }) => {
    const limits = { shallow: 3, normal: 7, deep: 15 };
    const limit = limits[depth];

    // Search for relevant memories across all types
    const memories = await searchMemories(topic, {
      limit,
      project: config.current_project,
    });

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No memories found for topic: "${topic}"\n\nStarting fresh on this topic.`,
          },
        ],
      };
    }

    // Organize by type
    const byType: Record<string, typeof memories> = {};
    for (const m of memories) {
      if (!byType[m.type]) byType[m.type] = [];
      byType[m.type].push(m);
    }

    const sections: string[] = [];

    // Priority order for alignment
    const typeOrder: MemoryType[] = ["decision", "pattern", "context", "learning", "preference", "todo", "reference"];

    for (const type of typeOrder) {
      const items = byType[type];
      if (items?.length) {
        const formatted = items
          .map((m) => `  • ${m.content.slice(0, 150)}${m.content.length > 150 ? "..." : ""}`)
          .join("\n");
        sections.push(`${type.toUpperCase()}S:\n${formatted}`);
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Soul Alignment: "${topic}"\n` +
            `${"=".repeat(20 + topic.length)}\n\n` +
            `Found ${memories.length} relevant memories:\n\n` +
            sections.join("\n\n") +
            `\n\n---\nAligned and ready to continue work on "${topic}".`,
        },
      ],
    };
  }
);

// Detect implicit triggers in a message (for autonomous operation)
server.tool(
  "detect_intent",
  {
    message: z.string().describe("The user message to analyze for implicit memory triggers"),
  },
  async ({ message }) => {
    const trigger = detectTrigger(message);

    if (!trigger) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No implicit memory triggers detected.",
          },
        ],
      };
    }

    let suggestion = "";

    switch (trigger.type) {
      case "save":
        suggestion = `Detected SAVE trigger (${trigger.memoryType}, ${Math.round(trigger.confidence * 100)}% confidence)\n` +
          `Content: "${trigger.extractedContent?.slice(0, 100)}..."\n` +
          `Suggested tags: ${trigger.suggestedTags?.join(", ") || "none"}\n\n` +
          `→ Recommend: Call 'remember' tool with this content`;
        break;
      case "recall":
        suggestion = `Detected RECALL trigger (${Math.round(trigger.confidence * 100)}% confidence)\n` +
          `Query: "${trigger.extractedContent}"\n\n` +
          `→ Recommend: Call 'recall' tool with this query`;
        break;
      case "synthesize":
        suggestion = `Detected SYNTHESIZE trigger (${Math.round(trigger.confidence * 100)}% confidence)\n\n` +
          `→ Recommend: Call 'synthesize' tool on recent conversation`;
        break;
      case "align":
        suggestion = `Detected ALIGN trigger (${Math.round(trigger.confidence * 100)}% confidence)\n` +
          `Topic: "${trigger.extractedContent}"\n\n` +
          `→ Recommend: Call 'align' tool with this topic`;
        break;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: suggestion,
        },
      ],
    };
  }
);

// Assimilate: Integrate new info with existing memories (update or merge)
server.tool(
  "assimilate",
  {
    content: z.string().describe("New information to assimilate"),
    merge_threshold: z.number().min(0).max(1).optional().default(0.7),
  },
  async ({ content, merge_threshold }) => {
    // Find similar existing memories
    const similar = await searchMemories(content, { limit: 5 });
    const closeMatches = similar.filter((m) => m.score >= merge_threshold);

    if (closeMatches.length === 0) {
      // No close matches - save as new
      const type = detectMemoryType(content);
      const tags = detectTags(content);
      const importance = estimateImportance(content);

      const id = await saveMemory({
        content,
        type,
        tags,
        importance,
        project: config.current_project,
        session_id: getCurrentSessionId(),
        timestamp: new Date().toISOString(),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Assimilated as NEW memory: ${id}\nType: ${type}\nTags: ${tags.join(", ")}`,
          },
        ],
      };
    }

    // Found close matches - report for potential merge
    const matchReport = closeMatches
      .map((m) => `  [${m.id}] (${Math.round(m.score * 100)}% similar)\n    "${m.content.slice(0, 100)}..."`)
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Found ${closeMatches.length} similar memories:\n\n${matchReport}\n\n` +
            `Options:\n` +
            `1. Use 'update_memory' to update an existing memory\n` +
            `2. Use 'merge_memories' to consolidate\n` +
            `3. Use 'remember' with different phrasing to save as distinct`,
        },
      ],
    };
  }
);

// Bi-directional analysis: analyze both user message AND Claude's response
server.tool(
  "analyze_turn",
  {
    user_message: z.string().describe("The user's message"),
    claude_response: z.string().describe("Claude's response to analyze for insights"),
    auto_save: z.boolean().optional().default(false).describe("Automatically save detected insights"),
  },
  async ({ user_message, claude_response, auto_save }) => {
    const analysis = analyzeConversationTurn(user_message, claude_response);

    const results: string[] = [];

    // Report user trigger
    if (analysis.userTrigger) {
      const ut = analysis.userTrigger;
      results.push(
        `USER TRIGGER DETECTED:\n` +
        `  Type: ${ut.type} → ${ut.memoryType || "N/A"}\n` +
        `  Confidence: ${Math.round(ut.confidence * 100)}%\n` +
        `  Content: "${ut.extractedContent?.slice(0, 80)}..."`
      );

      if (auto_save && ut.type === "save" && ut.confidence >= 0.7) {
        const id = await saveMemory({
          content: ut.extractedContent || user_message,
          type: ut.memoryType || "context",
          tags: ut.suggestedTags || [],
          importance: estimateImportance(ut.extractedContent || user_message),
          project: config.current_project,
          session_id: getCurrentSessionId(),
          timestamp: new Date().toISOString(),
        });
        results.push(`  → AUTO-SAVED as ${id}`);
      }
    }

    // Report Claude insights
    if (analysis.claudeInsights.length > 0) {
      results.push(`\nCLAUDE INSIGHTS DETECTED (${analysis.claudeInsights.length}):`);

      for (const insight of analysis.claudeInsights) {
        results.push(
          `  • ${insight.memoryType?.toUpperCase()}: "${insight.extractedContent?.slice(0, 60)}..."\n` +
          `    Confidence: ${Math.round(insight.confidence * 100)}%`
        );

        if (auto_save && insight.confidence >= 0.75) {
          const id = await saveMemory({
            content: insight.extractedContent || "",
            type: insight.memoryType || "learning",
            tags: insight.suggestedTags || [],
            importance: estimateImportance(insight.extractedContent || ""),
            project: config.current_project,
            session_id: getCurrentSessionId(),
            timestamp: new Date().toISOString(),
          });
          results.push(`    → AUTO-SAVED as ${id}`);
        }
      }
    }

    // Report semantic signal
    results.push(
      `\nSEMANTIC SIGNAL: ${analysis.semanticSignal.signal.toUpperCase()}\n` +
      `  Reason: ${analysis.semanticSignal.reason}\n` +
      `  Importance boost: +${analysis.semanticSignal.boost}`
    );

    // Summary
    results.push(
      `\n${"─".repeat(40)}\n` +
      `SUMMARY:\n` +
      `  Should auto-save: ${analysis.shouldAutoSave ? "YES" : "NO"}\n` +
      `  Total memorable items: ${analysis.totalMemorableItems}`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: results.join("\n"),
        },
      ],
    };
  }
);

// Extract insights from Claude's own response
server.tool(
  "reflect",
  {
    response: z.string().describe("Claude's response to analyze for self-insights"),
    auto_save: z.boolean().optional().default(true),
  },
  async ({ response, auto_save }) => {
    const insights = detectClaudeInsights(response);
    const signal = detectSemanticSignal(response);

    if (insights.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No notable insights detected in response.\nSemantic signal: ${signal.signal}`,
          },
        ],
      };
    }

    const results: string[] = [`Detected ${insights.length} insights from Claude's response:\n`];

    for (const insight of insights) {
      const baseImportance = estimateImportance(insight.extractedContent || "");
      const boostedImportance = Math.min(5, baseImportance + signal.boost);

      if (auto_save && insight.confidence >= 0.7) {
        const id = await saveMemory({
          content: insight.extractedContent || "",
          type: insight.memoryType || "learning",
          tags: [...(insight.suggestedTags || []), "claude-insight"],
          importance: boostedImportance,
          project: config.current_project,
          session_id: getCurrentSessionId(),
          timestamp: new Date().toISOString(),
          metadata: { source: "claude-reflection", signal: signal.signal },
        });

        results.push(
          `[SAVED] ${insight.memoryType?.toUpperCase()} → ${id}\n` +
          `  "${insight.extractedContent?.slice(0, 80)}..."\n` +
          `  Importance: ${boostedImportance}/5 (boosted by ${signal.signal} signal)`
        );
      } else {
        results.push(
          `[DETECTED] ${insight.memoryType?.toUpperCase()} (${Math.round(insight.confidence * 100)}%)\n` +
          `  "${insight.extractedContent?.slice(0, 80)}..."`
        );
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: results.join("\n\n"),
        },
      ],
    };
  }
);

// ============ RESOURCES (Auto-context) ============

// Resource: Get relevant context for current conversation
server.resource(
  "context",
  new ResourceTemplate("memory://context/{query}", { list: undefined }),
  async (uri, { query }) => {
    const queryStr = Array.isArray(query) ? query[0] : query || "";
    const memories = await searchMemories(queryStr, {
      limit: config.max_context_memories,
      project: config.current_project,
    });

    const relevantMemories = memories.filter(
      (m) => m.score >= config.context_relevance_threshold
    );

    if (relevantMemories.length === 0) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: "No relevant context found.",
          },
        ],
      };
    }

    const formatted = relevantMemories
      .map((m) => `[${m.type.toUpperCase()}] ${m.content}`)
      .join("\n\n");

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `Relevant context from memory:\n\n${formatted}`,
        },
      ],
    };
  }
);

// Resource: Current project context
server.resource(
  "project-context",
  new ResourceTemplate("memory://project/{name}", { list: undefined }),
  async (uri, { name }) => {
    const projectName = Array.isArray(name) ? name[0] : name || config.current_project;

    if (!projectName) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: "No project specified.",
          },
        ],
      };
    }

    // Get project info
    const projects = await listProjects();
    const project = projects.find((p) => p.name === projectName);

    // Get recent memories for project
    const memories = await listMemories({
      limit: 10,
      project: projectName,
      sortBy: "importance",
    });

    const memoriesText = memories
      .map((m) => `- [${m.type}] ${m.content.slice(0, 150)}${m.content.length > 150 ? "..." : ""}`)
      .join("\n");

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text:
            `Project: ${projectName}\n` +
            `Description: ${project?.description || "None"}\n` +
            `Tech stack: ${project?.tech_stack?.join(", ") || "Not specified"}\n\n` +
            `Key memories:\n${memoriesText || "None yet"}`,
        },
      ],
    };
  }
);

// ============ STARTUP ============

async function main() {
  console.error("Initializing Claude Memory MCP Server...");
  console.error(`Config: ${JSON.stringify(config, null, 2)}`);

  await initEmbeddings();
  await initDb();

  // Auto-start session
  await startSession(config.current_project);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Claude Memory MCP Server running.");
  console.error(`Current project: ${config.current_project || "none"}`);
  console.error(`Session: ${getCurrentSessionId()}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
