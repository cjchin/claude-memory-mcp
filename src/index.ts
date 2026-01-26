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
  getAllMemoriesWithEmbeddings,
  supersedeMemory,
  addMemoryLink,
  getMemoryLinks,
  removeMemoryLink,
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
import { MEMORY_TYPE_DESCRIPTIONS, type MemoryType, type DreamOperation, type Memory } from "./types.js";
import { introspect as runIntrospection, hasCapability, getFeatureStatus, loadManifest } from "./introspect.js";
import {
  runDreamCycle,
  runDreamCycleWithMutations,
  detectContradiction,
  findConsolidationCandidatesWithEmbeddings,
  intelligentMerge,
  calculateDecay,
  DEFAULT_DECAY_CONFIG,
  type DreamDbOperations,
  type ContradictionCandidate,
  type ConsolidationCandidate,
} from "./dream.js";
import {
  initShadowLog,
  recordActivity,
  listActiveShadows,
  getSessionShadows,
  getShadowEntry,
  getShadowById,
  checkPromotionThresholds,
  markShadowPromoted,
  getRecentlyPromoted,
  generateShadowSummary,
  decayOldShadows,
  finalizeShadow,
  getShadowStats,
  createActivity,
  estimateTokens,
  getActiveMinutes,
} from "./shadow-log.js";

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
  },
  async ({ content, type, tags, importance, project }) => {
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

    const id = await saveMemory({
      content: cleanedContent,
      type: detectedType,
      tags: mergedTags,
      importance: detectedImportance,
      project: project || config.current_project,
      session_id: getCurrentSessionId(),
      timestamp: new Date().toISOString(),
      valid_from: new Date().toISOString(),
      source: "human",
      // Store extracted reasoning in metadata
      metadata: extractedReasoning ? { reasoning: extractedReasoning } : undefined,
    });

    await addMemoryToSession(id);

    // Record shadow activity
    recordToolActivity("memory_access", `remember: ${detectedType} - ${cleanedContent.slice(0, 50)}...`);

    return {
      content: [
        {
          type: "text" as const,
          text: `Saved memory [${id}]\nType: ${detectedType}\nTags: ${mergedTags.join(", ") || "none"}\nImportance: ${detectedImportance}/5${extractedEntities.length ? `\nExtracted entities: ${extractedEntities.join(", ")}` : ""}`,
        },
      ],
    };
  }
);

// Semantic search
server.tool(
  "recall",
  {
    query: z.string().describe("What to search for (semantic search)"),
    limit: z.number().optional().default(5).describe("Max results"),
    types: z
      .array(z.enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference", "shadow"]))
      .optional()
      .describe("Filter by memory types"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    project: z.string().optional().describe("Filter by project"),
    min_importance: z.number().min(1).max(5).optional().describe("Minimum importance level"),
  },
  async ({ query, limit, types, tags, project, min_importance }) => {
    // Record shadow activity for search
    recordToolActivity("search", `recall: ${query}`);

    const memories = await searchMemories(query, {
      limit,
      types: types as MemoryType[] | undefined,
      tags,
      project: project || config.current_project,
      minImportance: min_importance,
    });

    if (memories.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No relevant memories found." }],
      };
    }

    const formatted = memories
      .map(
        (m, i) =>
          `[${i + 1}] ${m.type.toUpperCase()} (${Math.round(m.score * 100)}% match, importance: ${m.importance}/5)\n` +
          `ID: ${m.id}\n` +
          `Tags: ${m.tags.join(", ") || "none"}\n` +
          `Project: ${m.project || "unassigned"}\n` +
          `Date: ${m.timestamp}\n` +
          `${m.content}`
      )
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${memories.length} relevant memories:\n\n${formatted}`,
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

    // Record shadow activity for memory access
    recordToolActivity("memory_access", `get_memory: ${memory.type} - ${memory.content.slice(0, 50)}...`);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Memory: ${memory.id}\n` +
            `Type: ${memory.type}\n` +
            `Tags: ${memory.tags.join(", ")}\n` +
            `Importance: ${memory.importance}/5\n` +
            `Project: ${memory.project || "unassigned"}\n` +
            `Created: ${memory.timestamp}\n` +
            `Accessed: ${memory.access_count} times\n` +
            `Last accessed: ${memory.last_accessed || "never"}\n\n` +
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
      .enum(["decision", "pattern", "learning", "context", "preference", "todo", "reference", "shadow"])
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
      .enum(["decision", "pattern", "learning", "context", "preference", "summary", "todo", "reference", "shadow"])
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

// ============ DREAM STATE - MEMORY REORGANIZATION ============

/**
 * RUN_DREAM triggers the dream cycle for memory maintenance.
 * Operations:
 * - consolidate: Merge near-duplicate memories using semantic similarity
 * - contradiction: Detect conflicting memories
 * - decay: Apply time-based importance decay
 * - prune: Mark very low importance memories for removal
 */
server.tool(
  "run_dream",
  {
    operations: z.array(z.enum(["consolidate", "contradiction", "decay", "prune"]))
      .optional()
      .default(["consolidate", "contradiction", "decay"])
      .describe("Which dream operations to run. Default: all except prune"),
    dry_run: z.boolean()
      .optional()
      .default(true)
      .describe("Preview changes without applying. Default: true for safety"),
    project: z.string()
      .optional()
      .describe("Limit to memories in this project"),
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.85)
      .describe("Threshold for consolidation. 0.85 = very similar, 0.7 = somewhat similar"),
  },
  async ({ operations, dry_run, project, similarity_threshold }) => {
    // Get all memories
    let memories = await listMemories({
      limit: 1000,
      project: project || undefined,
    });

    if (memories.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "🌙 No memories to process in dream cycle.",
        }],
      };
    }

    const sections: string[] = [];
    sections.push(`🌙 DREAM CYCLE ${dry_run ? "(DRY RUN)" : ""}\n${"=".repeat(50)}\n`);
    sections.push(`Processing ${memories.length} memories...`);
    sections.push(`Operations: ${operations.join(", ")}`);
    if (project) sections.push(`Project filter: ${project}`);
    sections.push("");

    // Create DB operations wrapper for mutations
    const dbOps: DreamDbOperations = {
      updateMemory: async (id, updates) => {
        await updateMemory(id, updates);
      },
      deleteMemory: async (id) => {
        await deleteMemory(id);
      },
      saveMemory: async (memory) => {
        return await saveMemory(memory);
      },
      supersedeMemory: async (oldId, newId) => {
        await supersedeMemory(oldId, newId);
      },
    };

    // Run the dream cycle
    const report = dry_run
      ? runDreamCycle(memories, {
          operations: operations as DreamOperation[],
          dryRun: true,
          consolidationThreshold: similarity_threshold,
        })
      : await runDreamCycleWithMutations(memories, {
          operations: operations as DreamOperation[],
          dryRun: false,
          consolidationThreshold: similarity_threshold,
        }, dbOps);

    // Format report
    if (operations.includes("contradiction")) {
      sections.push(`\n⚡ CONTRADICTIONS: ${report.contradictions_found.length}`);
      for (const c of report.contradictions_found.slice(0, 10)) {
        sections.push(`  • [${c.conflict_type}] ${c.memory_a} ↔ ${c.memory_b}`);
        sections.push(`    ${c.explanation}`);
      }
      if (report.contradictions_found.length > 10) {
        sections.push(`  ... and ${report.contradictions_found.length - 10} more`);
      }
    }

    if (operations.includes("consolidate")) {
      sections.push(`\n🔗 CONSOLIDATION CANDIDATES: ${report.consolidations}`);
      if (report.summaries_created.length > 0) {
        sections.push(`  Created ${report.summaries_created.length} merged memories`);
      }
    }

    if (operations.includes("decay")) {
      sections.push(`\n📉 MEMORIES DECAYED: ${report.memories_decayed}`);
    }

    if (operations.includes("prune")) {
      sections.push(`\n🗑️ MEMORIES PRUNED: ${report.memories_pruned}`);
    }

    sections.push(`\n⏱️ Duration: ${new Date(report.completed_at).getTime() - new Date(report.started_at).getTime()}ms`);

    if (dry_run) {
      sections.push(`\n💡 This was a dry run. Use dry_run: false to apply changes.`);
    } else {
      sections.push(`\n✅ Dream cycle completed. Database updated.`);
    }

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

/**
 * DETECT_CONTRADICTIONS finds conflicting memories without running full dream cycle.
 * Useful for investigating specific areas of potential conflict.
 */
server.tool(
  "detect_contradictions",
  {
    project: z.string()
      .optional()
      .describe("Limit search to this project"),
    min_confidence: z.number()
      .min(0)
      .max(1)
      .optional()
      .default(0.6)
      .describe("Minimum confidence threshold for reporting conflicts"),
  },
  async ({ project, min_confidence }) => {
    let memories = await listMemories({
      limit: 500,
      project: project || undefined,
    });

    if (memories.length < 2) {
      return {
        content: [{
          type: "text" as const,
          text: "Need at least 2 memories to detect contradictions.",
        }],
      };
    }

    const contradictions: ContradictionCandidate[] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const conflict = detectContradiction(memories[i], memories[j]);
        if (conflict && conflict.confidence >= min_confidence) {
          contradictions.push(conflict);
        }
      }
    }

    if (contradictions.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No contradictions found among ${memories.length} memories.`,
        }],
      };
    }

    // Sort by confidence descending
    contradictions.sort((a, b) => b.confidence - a.confidence);

    const sections: string[] = [];
    sections.push(`⚡ CONTRADICTIONS DETECTED: ${contradictions.length}\n`);

    for (const c of contradictions) {
      const emoji = c.conflict_type === "temporal" ? "🕐" : c.conflict_type === "direct" ? "❌" : "🔀";
      sections.push(`${emoji} ${c.conflict_type.toUpperCase()} (${(c.confidence * 100).toFixed(0)}% confidence)`);
      sections.push(`   Memory A: ${c.memory_a.content.slice(0, 80)}...`);
      sections.push(`   Memory B: ${c.memory_b.content.slice(0, 80)}...`);
      sections.push(`   ${c.explanation}`);
      sections.push("");
    }

    sections.push(`💡 To resolve temporal conflicts, consider running:`);
    sections.push(`   run_dream({ operations: ["contradiction"], dry_run: false })`);

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

/**
 * FIND_CONSOLIDATION_CANDIDATES finds memories that could be merged.
 * Uses semantic (embedding) similarity for accurate detection.
 */
server.tool(
  "find_consolidation_candidates",
  {
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.8)
      .describe("How similar memories must be to merge. 0.8 = quite similar"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    limit: z.number()
      .optional()
      .default(100)
      .describe("Max memories to analyze (embedding is slow for large sets)"),
  },
  async ({ similarity_threshold, project, limit }) => {
    const memories = await listMemories({
      limit,
      project: project || undefined,
    });

    if (memories.length < 2) {
      return {
        content: [{
          type: "text" as const,
          text: "Need at least 2 memories to find consolidation candidates.",
        }],
      };
    }

    const sections: string[] = [];
    sections.push(`🔍 Analyzing ${memories.length} memories for consolidation...`);
    sections.push(`   Similarity threshold: ${(similarity_threshold * 100).toFixed(0)}%\n`);

    const candidates = await findConsolidationCandidatesWithEmbeddings(memories, similarity_threshold);

    if (candidates.length === 0) {
      sections.push(`✅ No consolidation candidates found at ${(similarity_threshold * 100).toFixed(0)}% similarity.`);
      sections.push(`   Try lowering the threshold if you want to find more similar memories.`);
    } else {
      sections.push(`📦 CONSOLIDATION CANDIDATES: ${candidates.length}\n`);

      for (let i = 0; i < Math.min(candidates.length, 10); i++) {
        const c = candidates[i];
        sections.push(`Group ${i + 1} (${c.memories.length} memories, ${(c.similarity * 100).toFixed(0)}% similar):`);
        for (const m of c.memories.slice(0, 3)) {
          sections.push(`  • [${m.id.slice(0, 12)}...] ${m.content.slice(0, 60)}...`);
        }
        if (c.memories.length > 3) {
          sections.push(`  ... and ${c.memories.length - 3} more`);
        }
        sections.push(`  📝 Merge rationale: ${c.mergeRationale}`);
        sections.push("");
      }

      if (candidates.length > 10) {
        sections.push(`... and ${candidates.length - 10} more groups`);
      }

      sections.push(`\n💡 To apply consolidation, run:`);
      sections.push(`   run_dream({ operations: ["consolidate"], dry_run: false })`);
      sections.push(`   OR use review_consolidation to evaluate each one consciously.`);
    }

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

// ============ CONSCIOUS PROCESSING - LLM-IN-THE-LOOP ============

/**
 * These tools enable "conscious" processing where Claude evaluates each item
 * individually with full reasoning, rather than automatic/heuristic processing.
 * 
 * Flow:
 * 1. review_* tool returns ONE candidate with full context
 * 2. Claude (you) evaluates with full reasoning capability
 * 3. apply_* tool executes Claude's decision
 */

// In-memory queue for conscious review (cleared on restart)
const consciousReviewState = {
  contradictions: [] as ContradictionCandidate[],
  consolidations: [] as ConsolidationCandidate[],
  currentContradictionIndex: 0,
  currentConsolidationIndex: 0,
  initialized: false,
};

/**
 * REVIEW_CONTRADICTION - Pull ONE contradiction for conscious evaluation.
 * 
 * This is the "conscious" pathway - instead of automatic resolution,
 * YOU (Claude) evaluate whether this is a real conflict and how to resolve it.
 */
server.tool(
  "review_contradiction",
  {
    refresh: z.boolean()
      .optional()
      .default(false)
      .describe("Refresh the queue by re-scanning memories"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    skip: z.boolean()
      .optional()
      .default(false)
      .describe("Skip current and move to next without resolving"),
  },
  async ({ refresh, project, skip }) => {
    // Skip if requested
    if (skip && consciousReviewState.contradictions.length > 0) {
      consciousReviewState.currentContradictionIndex++;
    }

    // Refresh or initialize the queue
    if (refresh || !consciousReviewState.initialized || consciousReviewState.contradictions.length === 0) {
      const memories = await listMemories({
        limit: 500,
        project: project || undefined,
      });

      consciousReviewState.contradictions = [];
      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const conflict = detectContradiction(memories[i], memories[j]);
          if (conflict && conflict.confidence >= 0.6) {
            consciousReviewState.contradictions.push(conflict);
          }
        }
      }
      consciousReviewState.contradictions.sort((a, b) => b.confidence - a.confidence);
      consciousReviewState.currentContradictionIndex = 0;
      consciousReviewState.initialized = true;
    }

    const idx = consciousReviewState.currentContradictionIndex;
    const total = consciousReviewState.contradictions.length;

    if (idx >= total) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No more contradictions to review.\n\nReviewed ${total} total. Use { refresh: true } to re-scan.`,
        }],
      };
    }

    const c = consciousReviewState.contradictions[idx];
    const emoji = c.conflict_type === "temporal" ? "🕐" : "❌";

    const text = `
${emoji} CONTRADICTION ${idx + 1}/${total} - ${c.conflict_type.toUpperCase()}
${"═".repeat(60)}
Confidence: ${(c.confidence * 100).toFixed(0)}%
Explanation: ${c.explanation}

📄 MEMORY A (${c.memory_a.type})
   ID: ${c.memory_a.id}
   Created: ${c.memory_a.timestamp}
   Importance: ${c.memory_a.importance}
   Tags: ${c.memory_a.tags.join(", ") || "none"}
   
   "${c.memory_a.content}"

📄 MEMORY B (${c.memory_b.type})
   ID: ${c.memory_b.id}
   Created: ${c.memory_b.timestamp}
   Importance: ${c.memory_b.importance}
   Tags: ${c.memory_b.tags.join(", ") || "none"}
   
   "${c.memory_b.content}"

${"─".repeat(60)}
🧠 YOUR EVALUATION NEEDED:
1. Is this a real contradiction, or a false positive?
2. If real, which memory is correct/current?
3. Should the loser be:
   - Superseded (marked as replaced by winner)
   - Updated (merge info from both)
   - Deleted (completely wrong)
   - Kept (they're actually compatible)

To resolve, call resolve_contradiction with your decision.
To skip this one, call review_contradiction({ skip: true }).
`;

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    };
  }
);

/**
 * RESOLVE_CONTRADICTION - Apply your conscious decision about a contradiction.
 */
server.tool(
  "resolve_contradiction",
  {
    action: z.enum(["supersede_a", "supersede_b", "keep_both", "merge", "delete_a", "delete_b"])
      .describe("supersede_a: B wins, A marked old. supersede_b: A wins. keep_both: false positive. merge: combine into new. delete: remove."),
    merged_content: z.string()
      .optional()
      .describe("If action=merge, provide the combined content"),
    reasoning: z.string()
      .optional()
      .describe("Your reasoning for this decision (stored for learning)"),
  },
  async ({ action, merged_content, reasoning }) => {
    const idx = consciousReviewState.currentContradictionIndex;
    if (idx >= consciousReviewState.contradictions.length) {
      return {
        content: [{
          type: "text" as const,
          text: "❌ No contradiction currently being reviewed. Call review_contradiction first.",
        }],
      };
    }

    const c = consciousReviewState.contradictions[idx];
    let resultText = "";

    try {
      switch (action) {
        case "supersede_a":
          // B wins, A is superseded
          await supersedeMemory(c.memory_a.id, c.memory_b.id);
          resultText = `✅ Memory A superseded by Memory B.\n   "${c.memory_a.content.slice(0, 50)}..." → marked as replaced.`;
          break;

        case "supersede_b":
          // A wins, B is superseded
          await supersedeMemory(c.memory_b.id, c.memory_a.id);
          resultText = `✅ Memory B superseded by Memory A.\n   "${c.memory_b.content.slice(0, 50)}..." → marked as replaced.`;
          break;

        case "keep_both":
          resultText = `✅ Keeping both memories (false positive or compatible).\n   No changes made.`;
          break;

        case "merge":
          if (!merged_content) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ merge action requires merged_content parameter.",
              }],
            };
          }
          // Create merged memory, supersede both originals
          const newId = await saveMemory({
            content: merged_content,
            type: c.memory_a.importance >= c.memory_b.importance ? c.memory_a.type : c.memory_b.type,
            tags: [...new Set([...c.memory_a.tags, ...c.memory_b.tags])],
            timestamp: new Date().toISOString(),
            importance: Math.max(c.memory_a.importance, c.memory_b.importance),
            source: "conscious_merge",
            layer: c.memory_a.layer || "long_term",
            valid_from: new Date().toISOString(),
            metadata: {
              merged_from: [c.memory_a.id, c.memory_b.id],
              merge_reasoning: reasoning,
            },
          });
          await supersedeMemory(c.memory_a.id, newId);
          await supersedeMemory(c.memory_b.id, newId);
          resultText = `✅ Created merged memory: ${newId}\n   Both originals marked as superseded.`;
          break;

        case "delete_a":
          await deleteMemory(c.memory_a.id);
          resultText = `✅ Deleted Memory A.\n   "${c.memory_a.content.slice(0, 50)}..." → removed.`;
          break;

        case "delete_b":
          await deleteMemory(c.memory_b.id);
          resultText = `✅ Deleted Memory B.\n   "${c.memory_b.content.slice(0, 50)}..." → removed.`;
          break;
      }

      // Move to next
      consciousReviewState.currentContradictionIndex++;
      const remaining = consciousReviewState.contradictions.length - consciousReviewState.currentContradictionIndex;
      
      resultText += `\n\n${remaining} contradiction(s) remaining.`;
      if (remaining > 0) {
        resultText += `\nCall review_contradiction to see the next one.`;
      }

      if (reasoning) {
        resultText += `\n\n📝 Reasoning recorded: "${reasoning}"`;
      }

    } catch (error) {
      resultText = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      content: [{
        type: "text" as const,
        text: resultText,
      }],
    };
  }
);

/**
 * REVIEW_CONSOLIDATION - Pull ONE consolidation candidate for conscious evaluation.
 * 
 * Instead of heuristic merge, YOU decide what content to keep/combine.
 */
server.tool(
  "review_consolidation",
  {
    refresh: z.boolean()
      .optional()
      .default(false)
      .describe("Refresh queue by re-scanning with embeddings"),
    similarity_threshold: z.number()
      .min(0.5)
      .max(0.99)
      .optional()
      .default(0.8)
      .describe("Similarity threshold for finding candidates"),
    project: z.string()
      .optional()
      .describe("Limit to this project"),
    skip: z.boolean()
      .optional()
      .default(false)
      .describe("Skip current without merging"),
  },
  async ({ refresh, similarity_threshold, project, skip }) => {
    // Skip if requested
    if (skip && consciousReviewState.consolidations.length > 0) {
      consciousReviewState.currentConsolidationIndex++;
    }

    // Refresh or initialize
    if (refresh || consciousReviewState.consolidations.length === 0) {
      const memories = await listMemories({
        limit: 200, // Embeddings are expensive
        project: project || undefined,
      });

      if (memories.length < 2) {
        return {
          content: [{
            type: "text" as const,
            text: "Need at least 2 memories to find consolidation candidates.",
          }],
        };
      }

      consciousReviewState.consolidations = await findConsolidationCandidatesWithEmbeddings(
        memories, 
        similarity_threshold
      );
      consciousReviewState.currentConsolidationIndex = 0;
    }

    const idx = consciousReviewState.currentConsolidationIndex;
    const total = consciousReviewState.consolidations.length;

    if (idx >= total) {
      return {
        content: [{
          type: "text" as const,
          text: `✅ No more consolidation candidates to review.\n\nReviewed ${total} total. Use { refresh: true } to re-scan.`,
        }],
      };
    }

    const c = consciousReviewState.consolidations[idx];
    
    let memoriesText = "";
    for (let i = 0; i < c.memories.length; i++) {
      const m = c.memories[i];
      memoriesText += `
📄 MEMORY ${i + 1} (${m.type})
   ID: ${m.id}
   Created: ${m.timestamp}
   Importance: ${m.importance}
   Tags: ${m.tags.join(", ") || "none"}
   
   "${m.content}"
`;
    }

    const text = `
📦 CONSOLIDATION CANDIDATE ${idx + 1}/${total}
${"═".repeat(60)}
Similarity: ${(c.similarity * 100).toFixed(0)}%
Heuristic suggestion: ${c.mergeRationale}

${memoriesText}
${"─".repeat(60)}
🤖 HEURISTIC MERGE (for reference):
"${c.suggestedMerge}"

${"─".repeat(60)}
🧠 YOUR EVALUATION NEEDED:
1. Should these memories be merged?
2. If yes, what should the final content be?
   - Keep one as-is?
   - Combine key points from both?
   - Rewrite for clarity?
3. What tags and importance should the result have?

To apply, call apply_consolidation with your decision.
To skip, call review_consolidation({ skip: true }).
`;

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    };
  }
);

/**
 * APPLY_CONSOLIDATION - Apply your conscious merge decision.
 */
server.tool(
  "apply_consolidation",
  {
    action: z.enum(["merge", "keep_all", "keep_first", "keep_best"])
      .describe("merge: create new from your content. keep_all: false positive. keep_first/keep_best: delete others."),
    merged_content: z.string()
      .optional()
      .describe("If action=merge, YOUR synthesized content (not the heuristic!)"),
    merged_tags: z.array(z.string())
      .optional()
      .describe("Tags for the merged memory"),
    merged_importance: z.number()
      .min(1)
      .max(5)
      .optional()
      .describe("Importance 1-5 for merged memory"),
    reasoning: z.string()
      .optional()
      .describe("Your reasoning for merge decisions"),
  },
  async ({ action, merged_content, merged_tags, merged_importance, reasoning }) => {
    const idx = consciousReviewState.currentConsolidationIndex;
    if (idx >= consciousReviewState.consolidations.length) {
      return {
        content: [{
          type: "text" as const,
          text: "❌ No consolidation currently being reviewed. Call review_consolidation first.",
        }],
      };
    }

    const c = consciousReviewState.consolidations[idx];
    let resultText = "";

    try {
      switch (action) {
        case "merge":
          if (!merged_content) {
            return {
              content: [{
                type: "text" as const,
                text: "❌ merge action requires merged_content parameter with YOUR synthesized content.",
              }],
            };
          }
          
          // Create the merged memory
          const bestOriginal = c.memories.reduce((best, m) => 
            m.importance > best.importance ? m : best
          );
          
          const newId = await saveMemory({
            content: merged_content,
            type: bestOriginal.type,
            tags: merged_tags || [...new Set(c.memories.flatMap(m => m.tags))],
            timestamp: new Date().toISOString(),
            importance: merged_importance || Math.max(...c.memories.map(m => m.importance)),
            source: "conscious_consolidation",
            layer: bestOriginal.layer || "long_term",
            valid_from: new Date().toISOString(),
            metadata: {
              consolidated_from: c.memories.map(m => m.id),
              consolidation_reasoning: reasoning,
            },
          });
          
          // Supersede all originals
          for (const m of c.memories) {
            await supersedeMemory(m.id, newId);
          }
          
          resultText = `✅ Created consolidated memory: ${newId}\n   Merged ${c.memories.length} memories into one.\n   Originals marked as superseded.`;
          break;

        case "keep_all":
          resultText = `✅ Keeping all memories (false positive or intentionally separate).\n   No changes made.`;
          break;

        case "keep_first":
          // Keep first, supersede others
          for (let i = 1; i < c.memories.length; i++) {
            await supersedeMemory(c.memories[i].id, c.memories[0].id);
          }
          resultText = `✅ Kept first memory, superseded ${c.memories.length - 1} others.`;
          break;

        case "keep_best":
          // Keep highest importance, supersede others
          const best = c.memories.reduce((b, m) => m.importance > b.importance ? m : b);
          for (const m of c.memories) {
            if (m.id !== best.id) {
              await supersedeMemory(m.id, best.id);
            }
          }
          resultText = `✅ Kept best memory (importance ${best.importance}), superseded ${c.memories.length - 1} others.`;
          break;
      }

      // Move to next
      consciousReviewState.currentConsolidationIndex++;
      const remaining = consciousReviewState.consolidations.length - consciousReviewState.currentConsolidationIndex;
      
      resultText += `\n\n${remaining} consolidation candidate(s) remaining.`;
      if (remaining > 0) {
        resultText += `\nCall review_consolidation to see the next one.`;
      }

      if (reasoning) {
        resultText += `\n\n📝 Reasoning recorded: "${reasoning}"`;
      }

    } catch (error) {
      resultText = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      content: [{
        type: "text" as const,
        text: resultText,
      }],
    };
  }
);

// ============ LLM CONFIGURATION - UNCONSCIOUS INTELLIGENCE ============

import { getLLMProvider, isLLMAvailable, type LLMConfig } from "./llm.js";

/**
 * CONFIGURE_LLM - Set up LLM for enhanced dream processing.
 * 
 * When enabled, dream operations use LLM judgment instead of heuristics:
 * - Contradiction detection: LLM evaluates if memories truly conflict
 * - Consolidation: LLM synthesizes merged content intelligently
 * - Resolution: LLM decides which memory should supersede
 * 
 * Supports local (Ollama, LM Studio) or remote (Anthropic, OpenRouter) LLMs.
 */
server.tool(
  "configure_llm",
  {
    enable: z.boolean()
      .describe("Enable or disable LLM-assisted dream processing"),
    provider: z.enum(["ollama", "lmstudio", "openai", "anthropic", "openrouter"])
      .optional()
      .describe("LLM provider to use. Default: ollama"),
    base_url: z.string()
      .optional()
      .describe("API endpoint. Default varies by provider (e.g., http://localhost:11434 for Ollama)"),
    api_key: z.string()
      .optional()
      .describe("API key for remote providers (Anthropic, OpenRouter). Not needed for local."),
    model: z.string()
      .optional()
      .describe("Model to use. Default varies by provider (e.g., 'deepseek-coder:6.7b' for Ollama)"),
    temperature: z.number()
      .min(0)
      .max(2)
      .optional()
      .default(0.3)
      .describe("Creativity level 0-2. Default: 0.3 (deterministic for judgment tasks)"),
    max_tokens: z.number()
      .optional()
      .default(1000)
      .describe("Max response tokens. Default: 1000"),
  },
  async ({ enable, provider, base_url, api_key, model, temperature, max_tokens }) => {
    // Update config
    config.dream_use_llm = enable;
    
    if (enable) {
      const llmConfig: LLMConfig = {
        provider: provider || "ollama",
        baseUrl: base_url,
        apiKey: api_key,
        model: model,
        temperature: temperature,
        maxTokens: max_tokens,
      };
      
      config.llm = llmConfig;
      
      // Persist to config file
      try {
        await updateConfig({
          dream_use_llm: enable,
          llm: llmConfig,
        });
      } catch (e) {
        // Config update failed, still in memory
      }
      
      // Test availability
      const available = await isLLMAvailable();
      const providerInstance = getLLMProvider();
      
      if (!available) {
        return {
          content: [{
            type: "text" as const,
            text: `⚠️ LLM CONFIGURED BUT UNAVAILABLE\n\n` +
              `Provider: ${llmConfig.provider}\n` +
              `Base URL: ${llmConfig.baseUrl || "(default)"}\n` +
              `Model: ${llmConfig.model || "(default)"}\n\n` +
              `The LLM is not responding. Make sure:\n` +
              `- For Ollama: \`ollama serve\` is running and model is pulled\n` +
              `- For LM Studio: Server is running on configured port\n` +
              `- For remote: API key is valid and you have credits\n\n` +
              `Dream processing will fall back to heuristics until LLM is available.`,
          }],
        };
      }
      
      return {
        content: [{
          type: "text" as const,
          text: `✅ LLM ENABLED FOR DREAM PROCESSING\n\n` +
            `Provider: ${providerInstance?.name || llmConfig.provider}\n` +
            `Base URL: ${llmConfig.baseUrl || "(default)"}\n` +
            `Model: ${llmConfig.model || "(default)"}\n` +
            `Temperature: ${temperature}\n` +
            `Max Tokens: ${max_tokens}\n\n` +
            `Dream operations will now use LLM judgment for:\n` +
            `- ⚡ Contradiction evaluation (is it a real conflict?)\n` +
            `- 🔗 Consolidation synthesis (intelligent merging)\n` +
            `- 🔀 Resolution decisions (which memory wins?)\n\n` +
            `Run \`run_dream\` with \`dry_run: false\` to apply LLM-enhanced processing.`,
        }],
      };
    } else {
      // Disable
      config.llm = undefined;
      
      try {
        await updateConfig({
          dream_use_llm: false,
          llm: undefined,
        });
      } catch (e) {
        // Config update failed, still in memory
      }
      
      return {
        content: [{
          type: "text" as const,
          text: `🔇 LLM DISABLED FOR DREAM PROCESSING\n\n` +
            `Dream operations will use heuristic processing:\n` +
            `- Contradiction detection: regex patterns + timestamp comparison\n` +
            `- Consolidation: text similarity + keep-longest strategy\n\n` +
            `This is faster but less nuanced than LLM-assisted processing.`,
        }],
      };
    }
  }
);

/**
 * LLM_STATUS - Check current LLM configuration and availability.
 */
server.tool("llm_status", {}, async () => {
  const enabled = config.dream_use_llm;
  const llmConfig = config.llm;
  
  if (!enabled || !llmConfig) {
    return {
      content: [{
        type: "text" as const,
        text: `🔇 LLM Status: DISABLED\n\n` +
          `Dream processing uses heuristic mode.\n\n` +
          `To enable LLM-assisted processing:\n` +
          `  configure_llm({ enable: true, provider: "ollama", model: "deepseek-coder:6.7b" })\n\n` +
          `Supported providers:\n` +
          `- ollama: Local Ollama server (default port 11434)\n` +
          `- lmstudio: Local LM Studio server\n` +
          `- openai: OpenAI API or compatible\n` +
          `- anthropic: Anthropic Claude API\n` +
          `- openrouter: OpenRouter (access multiple models)`,
      }],
    };
  }
  
  const available = await isLLMAvailable();
  const provider = getLLMProvider();
  
  return {
    content: [{
      type: "text" as const,
      text: `${available ? "✅" : "⚠️"} LLM Status: ${available ? "ONLINE" : "OFFLINE"}\n\n` +
        `Provider: ${provider?.name || llmConfig.provider}\n` +
        `Base URL: ${llmConfig.baseUrl || "(default)"}\n` +
        `Model: ${llmConfig.model || "(default)"}\n` +
        `Temperature: ${llmConfig.temperature || 0.3}\n` +
        `Max Tokens: ${llmConfig.maxTokens || 1000}\n\n` +
        (available 
          ? `Dream operations are using LLM-enhanced judgment.`
          : `LLM is not responding. Falling back to heuristics.\nCheck that your LLM server is running.`),
    }],
  };
});

// ============ GRAPH ANALYSIS & LINKING ============

import {
  analyzeGraphEnrichment,
  generateProposedLinks,
  proposedLinkToMemoryLink,
  type ProposedLink,
  type EnrichmentResult,
} from "./graph-enrichment.js";

/**
 * GRAPH_ANALYSIS - View memory graph topology
 * Shows clusters, highways (high-centrality nodes), orphans, and link opportunities.
 */
server.tool(
  "graph_analysis",
  {
    project: z.string().optional().describe("Limit to this project"),
    min_similarity: z.number().min(0.3).max(0.95).optional().default(0.5)
      .describe("Minimum similarity threshold for connections"),
    max_display: z.number().optional().default(15)
      .describe("Max items to display per category"),
  },
  async ({ project, min_similarity, max_display }) => {
    const memories = await getAllMemoriesWithEmbeddings();
    const filtered = project ? memories.filter(m => m.project === project) : memories;

    if (filtered.length < 2) {
      return { content: [{ type: "text" as const, text: "Need at least 2 memories for graph analysis." }] };
    }

    const analysis = analyzeGraphEnrichment(filtered, { minSimilarity: min_similarity, maxLinksPerMemory: 5 });

    const sections: string[] = [];
    sections.push(`🕸️ GRAPH ANALYSIS\n${"═".repeat(50)}\n`);
    sections.push(`Total memories: ${analysis.totalMemories}`);
    sections.push(`Clusters found: ${analysis.clustersFound}`);
    sections.push(`Highways identified: ${analysis.highwaysIdentified}`);
    sections.push(`Links proposed: ${analysis.linksProposed}`);
    sections.push(`Cross-cluster bridges: ${analysis.crossClusterLinks}`);

    // Show clusters
    if (analysis.clusters.size > 0) {
      sections.push(`\n📦 CLUSTERS (${analysis.clustersFound}):`);
      let clusterNum = 0;
      for (const [clusterId, memberIds] of analysis.clusters) {
        if (clusterNum >= max_display) {
          sections.push(`  ... and ${analysis.clusters.size - clusterNum} more clusters`);
          break;
        }
        const members = memberIds.slice(0, 3).map(id => {
          const mem = filtered.find(m => m.id === id);
          return mem ? `"${mem.content.slice(0, 40)}..."` : id;
        });
        sections.push(`  Cluster ${clusterId}: ${memberIds.length} memories`);
        sections.push(`    ${members.join(", ")}${memberIds.length > 3 ? ` +${memberIds.length - 3} more` : ""}`);
        clusterNum++;
      }
    }

    // Show highways
    if (analysis.highways.length > 0) {
      sections.push(`\n🛣️ HIGHWAYS (high-centrality memories):`);
      for (const hwId of analysis.highways.slice(0, max_display)) {
        const mem = filtered.find(m => m.id === hwId);
        if (mem) {
          sections.push(`  • [${mem.type}] "${mem.content.slice(0, 60)}..."`);
        }
      }
    }

    // Show orphans (memories with no related_memories)
    const orphans = filtered.filter(m => !m.related_memories?.length);
    if (orphans.length > 0) {
      sections.push(`\n🏝️ ORPHANS (no links): ${orphans.length}`);
      for (const orphan of orphans.slice(0, Math.min(5, max_display))) {
        sections.push(`  • [${orphan.id.slice(0, 12)}...] "${orphan.content.slice(0, 50)}..."`);
      }
      if (orphans.length > 5) {
        sections.push(`  ... and ${orphans.length - 5} more`);
      }
    }

    sections.push(`\n💡 Use propose_links to generate link suggestions.`);

    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);

/**
 * PROPOSE_LINKS - Generate link proposals from graph analysis
 * Analyzes memory embeddings and proposes semantic links.
 */
server.tool(
  "propose_links",
  {
    limit: z.number().optional().default(20).describe("Max proposals to generate"),
    min_similarity: z.number().min(0.5).max(0.95).optional().default(0.6)
      .describe("Minimum similarity for link proposals"),
    project: z.string().optional().describe("Limit to this project"),
    prioritize_cross_cluster: z.boolean().optional().default(true)
      .describe("Prioritize links that bridge clusters"),
    prioritize_highways: z.boolean().optional().default(true)
      .describe("Prioritize connections to high-centrality nodes"),
  },
  async ({ limit, min_similarity, project, prioritize_cross_cluster, prioritize_highways }) => {
    const memories = await getAllMemoriesWithEmbeddings();
    const filtered = project ? memories.filter(m => m.project === project) : memories;

    if (filtered.length < 2) {
      return { content: [{ type: "text" as const, text: "Need at least 2 memories for link proposals." }] };
    }

    const proposals = generateProposedLinks(filtered, {
      minSimilarity: min_similarity,
      maxLinksPerMemory: 5,
      prioritizeCrossCluster: prioritize_cross_cluster,
      prioritizeHighways: prioritize_highways,
    });

    if (proposals.length === 0) {
      return { content: [{ type: "text" as const, text: `No link proposals at ${(min_similarity * 100).toFixed(0)}% similarity threshold.` }] };
    }

    const sections: string[] = [];
    sections.push(`🔗 LINK PROPOSALS (${Math.min(proposals.length, limit)} of ${proposals.length})\n`);

    for (let i = 0; i < Math.min(proposals.length, limit); i++) {
      const p = proposals[i];
      const source = filtered.find(m => m.id === p.sourceId);
      const target = filtered.find(m => m.id === p.targetId);

      const flags: string[] = [];
      if (p.isCrossCluster) flags.push("🌉 cross-cluster");
      if (p.isHighwayConnection) flags.push("🛣️ highway");

      sections.push(`${i + 1}. ${p.type.toUpperCase()} (${(p.similarity * 100).toFixed(0)}% similar)${flags.length ? " " + flags.join(" ") : ""}`);
      sections.push(`   Source: "${source?.content.slice(0, 50)}..."`);
      sections.push(`   Target: "${target?.content.slice(0, 50)}..."`);
      sections.push(`   Reason: ${p.reason}`);
      sections.push(`   → apply_link({ source_id: "${p.sourceId}", target_id: "${p.targetId}", link_type: "${p.type}" })`);
      sections.push("");
    }

    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);

// Helper for reverse link types
function getReverseLinkType(linkType: string): string {
  const reverseMap: Record<string, string> = {
    "supports": "supported_by",
    "contradicts": "contradicts",
    "extends": "extended_by",
    "supersedes": "superseded_by",
    "depends_on": "depended_on_by",
    "caused_by": "causes",
    "implements": "implemented_by",
    "example_of": "has_example",
    "related": "related",
  };
  return reverseMap[linkType] || "related";
}

/**
 * APPLY_LINK - Create a link between two memories
 * Creates rich links with type, reason, and strength.
 */
server.tool(
  "apply_link",
  {
    source_id: z.string().describe("Source memory ID"),
    target_id: z.string().describe("Target memory ID"),
    link_type: z.enum([
      "related", "supports", "contradicts", "extends",
      "supersedes", "depends_on", "caused_by", "implements", "example_of"
    ]).describe("Type of relationship"),
    reason: z.string().optional().describe("Why these are linked"),
    strength: z.number().min(0).max(1).optional().default(0.8)
      .describe("Link strength 0-1"),
    bidirectional: z.boolean().optional().default(true)
      .describe("Create reverse link too"),
  },
  async ({ source_id, target_id, link_type, reason, strength, bidirectional }) => {
    // Verify both memories exist
    const source = await getMemory(source_id);
    const target = await getMemory(target_id);

    if (!source) {
      return { content: [{ type: "text" as const, text: `❌ Source memory not found: ${source_id}` }] };
    }
    if (!target) {
      return { content: [{ type: "text" as const, text: `❌ Target memory not found: ${target_id}` }] };
    }

    // Create the link
    await addMemoryLink(source_id, {
      targetId: target_id,
      type: link_type,
      reason: reason || `${link_type} relationship`,
      strength,
      createdBy: "conscious",
    });

    let resultText = `✅ Created link: ${source_id.slice(0, 12)}... --[${link_type}]--> ${target_id.slice(0, 12)}...`;

    // Create reverse link if bidirectional
    if (bidirectional) {
      const reverseType = getReverseLinkType(link_type);
      await addMemoryLink(target_id, {
        targetId: source_id,
        type: reverseType,
        reason: reason || `${reverseType} relationship (reverse)`,
        strength,
        createdBy: "conscious",
      });
      resultText += `\n✅ Created reverse: ${target_id.slice(0, 12)}... --[${reverseType}]--> ${source_id.slice(0, 12)}...`;
    }

    return { content: [{ type: "text" as const, text: resultText }] };
  }
);

/**
 * GET_MEMORY_LINKS - View all links for a memory
 * Shows incoming and outgoing links.
 */
server.tool(
  "get_memory_links",
  {
    memory_id: z.string().describe("Memory ID to get links for"),
    direction: z.enum(["outgoing", "incoming", "both"]).optional().default("both")
      .describe("Which direction of links to show"),
  },
  async ({ memory_id, direction }) => {
    const memory = await getMemory(memory_id);
    if (!memory) {
      return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
    }

    const sections: string[] = [];
    sections.push(`🔗 LINKS FOR: "${memory.content.slice(0, 60)}..."\n`);

    // Outgoing links (from this memory)
    if (direction === "outgoing" || direction === "both") {
      const outgoing = await getMemoryLinks(memory_id);
      sections.push(`📤 OUTGOING (${outgoing.length}):`);
      if (outgoing.length === 0) {
        sections.push("   None");
      } else {
        for (const link of outgoing) {
          const target = await getMemory(link.targetId);
          sections.push(`   --[${link.type}]--> "${target?.content.slice(0, 40) || link.targetId}..."`);
          if (link.reason) sections.push(`      Reason: ${link.reason}`);
        }
      }
    }

    // Incoming links (to this memory) - need to search all memories
    if (direction === "incoming" || direction === "both") {
      const allMemories = await listMemories({ limit: 1000 });
      const incoming: Array<{ from: Memory; link: any }> = [];

      for (const m of allMemories) {
        const links = await getMemoryLinks(m.id);
        for (const link of links) {
          if (link.targetId === memory_id) {
            incoming.push({ from: m, link });
          }
        }
        // Also check simple related_memories
        if (m.related_memories?.includes(memory_id) && !links.some(l => l.targetId === memory_id)) {
          incoming.push({ from: m, link: { type: "related", targetId: memory_id } });
        }
      }

      sections.push(`\n📥 INCOMING (${incoming.length}):`);
      if (incoming.length === 0) {
        sections.push("   None");
      } else {
        for (const { from, link } of incoming.slice(0, 20)) {
          sections.push(`   "${from.content.slice(0, 40)}..." --[${link.type}]-->`);
        }
        if (incoming.length > 20) {
          sections.push(`   ... and ${incoming.length - 20} more`);
        }
      }
    }

    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);

// ============ POLICY ENGINE ============

import {
  PolicyEngine,
  createPersistentPolicyEngine,
  savePolicyEngine,
  ACTION_METADATA,
  type TrustScore,
  type WalkerAction,
} from "./policy.js";

// Initialize policy engine
const policyEngine = createPersistentPolicyEngine();

/**
 * POLICY_STATUS - View and manage the policy engine
 * Shows trust scores, approval rates, and allows configuration.
 */
server.tool(
  "policy_status",
  {
    action: z.enum(["status", "trust_details", "reset_trust"])
      .describe("status: overview. trust_details: per-action scores. reset_trust: reset one action."),
    walker_action: z.string().optional()
      .describe("For reset_trust: which action to reset (e.g., 'link_memories')"),
  },
  async ({ action, walker_action }) => {
    const sections: string[] = [];

    switch (action) {
      case "status": {
        const status = policyEngine.getStatus();
        sections.push(`⚖️ POLICY ENGINE STATUS\n${"═".repeat(40)}\n`);
        sections.push(`Enabled: ${status.enabled}`);
        sections.push(`Total proposals processed: ${status.totalProposals}`);
        sections.push(`Approval rate: ${(status.approvalRate * 100).toFixed(1)}%`);
        sections.push(`Human review rate: ${(status.humanReviewRate * 100).toFixed(1)}%`);
        sections.push(`\nActions with trust scores: ${status.trustScores.length}`);

        // Summary of trust levels
        const highTrust = status.trustScores.filter(t => t.score >= 0.7);
        const medTrust = status.trustScores.filter(t => t.score >= 0.4 && t.score < 0.7);
        const lowTrust = status.trustScores.filter(t => t.score < 0.4);

        sections.push(`  High trust (≥70%): ${highTrust.length} actions`);
        sections.push(`  Medium trust (40-70%): ${medTrust.length} actions`);
        sections.push(`  Low trust (<40%): ${lowTrust.length} actions`);
        sections.push(`\n💡 Use policy_status({ action: "trust_details" }) for per-action breakdown.`);
        break;
      }

      case "trust_details": {
        const status = policyEngine.getStatus();
        sections.push(`📊 TRUST SCORES BY ACTION\n${"═".repeat(40)}\n`);

        const allActions = Object.keys(ACTION_METADATA) as WalkerAction[];

        for (const act of allActions) {
          const meta = ACTION_METADATA[act];
          const trust = status.trustScores.find(t => t.action === act);
          const score = trust?.score ?? 0;
          const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));

          sections.push(`${act}:`);
          sections.push(`  Trust: [${bar}] ${(score * 100).toFixed(0)}%`);
          sections.push(`  Risk: ${meta.risk} | Default: ${meta.defaultDecision} | Min for auto: ${(meta.minTrustForAuto * 100).toFixed(0)}%`);
          if (trust) {
            sections.push(`  History: ${trust.approved} approved, ${trust.rejected} rejected, ${trust.autoApproved} auto`);
          }
          sections.push("");
        }
        break;
      }

      case "reset_trust": {
        if (!walker_action) {
          return { content: [{ type: "text" as const, text: "❌ walker_action required for reset_trust" }] };
        }

        if (!ACTION_METADATA[walker_action as WalkerAction]) {
          const validActions = Object.keys(ACTION_METADATA).join(", ");
          return { content: [{ type: "text" as const, text: `❌ Unknown action: ${walker_action}\nValid actions: ${validActions}` }] };
        }

        policyEngine.setTrustScore({
          action: walker_action as WalkerAction,
          score: 0,
          totalProposals: 0,
          approved: 0,
          rejected: 0,
          autoApproved: 0,
          lastUpdated: new Date().toISOString(),
        });
        savePolicyEngine(policyEngine);

        sections.push(`✅ Reset trust for "${walker_action}" to 0%`);
        sections.push(`The system will now require review for this action until trust is rebuilt.`);
        break;
      }
    }

    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
  }
);

// ============ PROJECT MANAGEMENT ============

/**
 * ASSIGN_PROJECT - Assign a memory to a project
 */
server.tool(
  "assign_project",
  {
    memory_id: z.string().describe("Memory ID to assign"),
    project: z.string().describe("Project name to assign to"),
  },
  async ({ memory_id, project }) => {
    const memory = await getMemory(memory_id);
    if (!memory) {
      return { content: [{ type: "text" as const, text: `❌ Memory not found: ${memory_id}` }] };
    }

    const oldProject = memory.project || "unassigned";
    await updateMemory(memory_id, { project });

    return {
      content: [{
        type: "text" as const,
        text: `✅ Moved memory from "${oldProject}" to "${project}"\n   "${memory.content.slice(0, 60)}..."`,
      }],
    };
  }
);

/**
 * BULK_ASSIGN_PROJECTS - Analyze and assign projects in bulk
 */
server.tool(
  "bulk_assign_projects",
  {
    action: z.enum(["analyze", "suggest", "apply"])
      .describe("analyze: show stats. suggest: propose assignments. apply: execute assignments."),
    assignments: z.array(z.object({
      memory_id: z.string(),
      project: z.string(),
    })).optional().describe("For apply: the assignments to execute"),
    limit: z.number().optional().default(20).describe("Max suggestions to generate"),
  },
  async ({ action, assignments, limit }) => {
    const sections: string[] = [];

    switch (action) {
      case "analyze": {
        const stats = await getMemoryStats();
        const unassigned = stats.byProject["unassigned"] || stats.byProject[""] || 0;
        const projects = await listProjects();

        sections.push(`📊 PROJECT ASSIGNMENT ANALYSIS\n${"═".repeat(40)}\n`);
        sections.push(`Total memories: ${stats.total}`);
        sections.push(`Unassigned: ${unassigned} (${stats.total > 0 ? ((unassigned / stats.total) * 100).toFixed(1) : 0}%)`);
        sections.push(`\nExisting projects (${projects.length}):`);

        for (const p of projects) {
          const count = stats.byProject[p.name] || 0;
          sections.push(`  • ${p.name}: ${count} memories`);
        }

        sections.push(`\n💡 Use bulk_assign_projects({ action: "suggest" }) to get assignment proposals.`);
        break;
      }

      case "suggest": {
        const allMemories = await listMemories({ limit: 500 });
        const unassigned = allMemories.filter(m => !m.project || m.project === "");

        if (unassigned.length === 0) {
          return { content: [{ type: "text" as const, text: "✅ All memories are assigned to projects!" }] };
        }

        const projects = await listProjects();
        const projectMemories: Record<string, Memory[]> = {};

        for (const p of projects) {
          projectMemories[p.name] = allMemories.filter(m => m.project === p.name);
        }

        sections.push(`📋 SUGGESTED ASSIGNMENTS (${Math.min(unassigned.length, limit)} of ${unassigned.length})\n`);

        const suggestions: Array<{ memory_id: string; project: string; reason: string }> = [];

        for (const mem of unassigned.slice(0, limit)) {
          let bestProject = "";
          let bestScore = 0;
          let bestReason = "";

          for (const [projName, projMems] of Object.entries(projectMemories)) {
            if (projMems.length === 0) continue;

            const projTags = new Set(projMems.flatMap(m => m.tags));
            const memTags = new Set(mem.tags);
            const overlap = [...memTags].filter(t => projTags.has(t));
            const score = overlap.length / Math.max(memTags.size, 1);

            if (score > bestScore) {
              bestScore = score;
              bestProject = projName;
              bestReason = overlap.length > 0 ? `Tags: ${overlap.slice(0, 3).join(", ")}` : "Best semantic match";
            }
          }

          if (bestProject && bestScore > 0.2) {
            suggestions.push({ memory_id: mem.id, project: bestProject, reason: bestReason });
            sections.push(`• "${mem.content.slice(0, 50)}..."`);
            sections.push(`  → ${bestProject} (${bestReason})`);
            sections.push("");
          }
        }

        if (suggestions.length > 0) {
          sections.push(`\n💡 To apply these suggestions:`);
          sections.push(`bulk_assign_projects({`);
          sections.push(`  action: "apply",`);
          sections.push(`  assignments: [`);
          for (const s of suggestions.slice(0, 5)) {
            sections.push(`    { memory_id: "${s.memory_id}", project: "${s.project}" },`);
          }
          if (suggestions.length > 5) sections.push(`    // ... ${suggestions.length - 5} more`);
          sections.push(`  ]`);
          sections.push(`})`);
        } else {
          sections.push(`No confident project assignments found.`);
          sections.push(`Consider creating projects first or manually assigning memories.`);
        }
        break;
      }

      case "apply": {
        if (!assignments || assignments.length === 0) {
          return { content: [{ type: "text" as const, text: "❌ No assignments provided" }] };
        }

        let success = 0;
        let failed = 0;

        for (const { memory_id, project } of assignments) {
          try {
            await updateMemory(memory_id, { project });
            success++;
          } catch (e) {
            failed++;
          }
        }

        sections.push(`✅ Applied ${success} assignments`);
        if (failed > 0) sections.push(`❌ Failed: ${failed}`);
        break;
      }
    }

    return { content: [{ type: "text" as const, text: sections.join("\n") }] };
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

    // Handle topic shift in shadow log
    if (config.shadow_enabled && topic) {
      const previousShadow = getShadowEntry(sessionId);
      if (previousShadow && previousShadow.topic !== topic && previousShadow.topic !== "general") {
        // Topic shift detected - finalize previous shadow
        finalizeShadow(previousShadow.id);
      }
    }

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

    // Shadow log section (if enabled)
    if (config.shadow_enabled) {
      const shadows = listActiveShadows();
      const recentlyPromoted = getRecentlyPromoted();
      const promotionCandidates = checkPromotionThresholds();

      if (shadows.length > 0) {
        sections.push(`\n👁️ RECENT SHADOWS (active working memory):`);
        for (const shadow of shadows.slice(0, 3)) {
          const isThisSession = shadow.session_id === sessionId;
          const sessionLabel = isThisSession ? "(this)" : "(other)";
          const activeMin = Math.round(getActiveMinutes(shadow));
          sections.push(
            `  ┌─ ${shadow.topic} ${sessionLabel} ───────────────────────────────────────\n` +
            `  │ Activity: ${shadow.activities.length} items, ${activeMin}min active\n` +
            `  │ Density: ${shadow.tokens} tokens\n` +
            `  └────────────────────────────────────────────────────────────`
          );
        }
        if (shadows.length > 3) {
          sections.push(`  ... and ${shadows.length - 3} more shadows`);
        }
      }

      if (recentlyPromoted.length > 0) {
        const recent = recentlyPromoted.slice(-3);
        sections.push(`\n✨ RECENTLY PROMOTED (auto-promoted since last prime):`);
        for (const promoted of recent) {
          sections.push(`  • [shadow→memory] "${promoted.topic}" (${promoted.memory_id})`);
        }
      }

      if (promotionCandidates.length > 0) {
        sections.push(`\n⚡ PROMOTION CANDIDATES (${promotionCandidates.length}):`);
        for (const candidate of promotionCandidates.slice(0, 2)) {
          sections.push(
            `  • "${candidate.topic}" - ${candidate.tokens} tokens (use promote_shadow to convert)`
          );
        }
      }
    }

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

// ============ SHADOW LOG - EPHEMERAL WORKING MEMORY ============

/**
 * SHADOW_STATUS - View all active shadows across sessions
 * Shows working memory state and promotion candidates
 */
server.tool(
  "shadow_status",
  {
    session_id: z.string().optional().describe("Filter to specific session"),
    include_stats: z.boolean().optional().default(true).describe("Include aggregate statistics"),
  },
  async ({ session_id, include_stats }) => {
    if (!config.shadow_enabled) {
      return {
        content: [{
          type: "text" as const,
          text: "Shadow log is disabled. Enable with shadow_enabled: true in config.",
        }],
      };
    }

    const sections: string[] = [];

    sections.push(
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║                    SHADOW LOG STATUS                        ║\n` +
      `╚══════════════════════════════════════════════════════════════╝\n`
    );

    // Get shadows
    const shadows = session_id
      ? getSessionShadows(session_id)
      : listActiveShadows();

    if (shadows.length === 0) {
      sections.push("No active shadows in working memory.\n");
    } else {
      sections.push(`👁️ ACTIVE SHADOWS (${shadows.length}):\n`);

      for (const shadow of shadows) {
        const isThisSession = shadow.session_id === getCurrentSessionId();
        const sessionLabel = isThisSession ? "(this session)" : `(${shadow.session_id.slice(0, 12)}...)`;
        const statusEmoji = shadow.status === "active" ? "🟢" : "🟡";
        const activeMin = Math.round(getActiveMinutes(shadow));

        sections.push(
          `  ┌─ ${shadow.topic} ${sessionLabel} ${statusEmoji}\n` +
          `  │ Activity: ${shadow.activities.length} items, ${activeMin}min active\n` +
          `  │ Density: ${shadow.tokens} tokens\n` +
          `  │ Last: ${new Date(shadow.last_activity).toLocaleTimeString()}\n` +
          `  └─────────────────────────────────────────────────────────────`
        );
      }
    }

    // Promotion candidates
    const candidates = checkPromotionThresholds();
    if (candidates.length > 0) {
      sections.push(`\n⚡ PROMOTION CANDIDATES (${candidates.length}):`);
      for (const candidate of candidates) {
        sections.push(
          `  • "${candidate.topic}" - ${candidate.tokens} tokens, ${Math.round(getActiveMinutes(candidate))}min`
        );
      }
      sections.push(`\n💡 Use promote_shadow to convert to long-term memory.`);
    }

    // Recently promoted
    const recentlyPromoted = getRecentlyPromoted();
    if (recentlyPromoted.length > 0) {
      sections.push(`\n✨ RECENTLY PROMOTED:`);
      for (const promoted of recentlyPromoted.slice(-5)) {
        sections.push(
          `  • [shadow→memory] "${promoted.topic}" → ${promoted.memory_id}`
        );
      }
    }

    // Stats
    if (include_stats) {
      const stats = getShadowStats();
      sections.push(
        `\n📊 STATISTICS:\n` +
        `  Total entries: ${stats.total}\n` +
        `  Active: ${stats.active}, Idle: ${stats.idle}\n` +
        `  Promoted: ${stats.promoted}, Decayed: ${stats.decayed}\n` +
        `  Working memory tokens: ${stats.totalTokens}`
      );
    }

    // Config info
    sections.push(
      `\n⚙️ THRESHOLDS:\n` +
      `  Token threshold: ${config.shadow_token_threshold}\n` +
      `  Time threshold: ${config.shadow_time_threshold_min}min\n` +
      `  Idle timeout: ${config.shadow_idle_timeout_min}min`
    );

    return {
      content: [{
        type: "text" as const,
        text: sections.join("\n"),
      }],
    };
  }
);

/**
 * PROMOTE_SHADOW - Manually promote a shadow to long-term memory
 */
server.tool(
  "promote_shadow",
  {
    shadow_id: z.string().optional().describe("Specific shadow ID to promote (or promotes first candidate)"),
    topic: z.string().optional().describe("Promote shadow by topic name"),
    custom_summary: z.string().optional().describe("Override auto-generated summary"),
  },
  async ({ shadow_id, topic, custom_summary }) => {
    if (!config.shadow_enabled) {
      return {
        content: [{
          type: "text" as const,
          text: "Shadow log is disabled.",
        }],
      };
    }

    // Find the shadow to promote
    let shadow = null;

    if (shadow_id) {
      shadow = getShadowById(shadow_id);
    } else if (topic) {
      const shadows = listActiveShadows();
      shadow = shadows.find(s => s.topic === topic);
    } else {
      // Promote first candidate
      const candidates = checkPromotionThresholds();
      if (candidates.length > 0) {
        shadow = candidates[0];
      }
    }

    if (!shadow) {
      return {
        content: [{
          type: "text" as const,
          text: shadow_id
            ? `Shadow ${shadow_id} not found.`
            : topic
              ? `No active shadow found for topic "${topic}".`
              : "No promotion candidates available.",
        }],
      };
    }

    // Generate summary
    const summary = custom_summary || generateShadowSummary(shadow);

    // Create memory from shadow
    const memoryId = await saveMemory({
      content: summary,
      type: "shadow",
      tags: [shadow.topic, "auto-promoted", "shadow-log"],
      importance: 2,  // Low importance, can be elevated by dream
      project: shadow.project || config.current_project,
      session_id: shadow.session_id,
      timestamp: new Date().toISOString(),
      metadata: {
        source: "shadow_promotion",
        original_shadow_id: shadow.id,
        activity_count: shadow.activities.length,
        token_density: shadow.tokens,
        active_minutes: Math.round(getActiveMinutes(shadow)),
      },
    });

    // Mark shadow as promoted
    markShadowPromoted(shadow.id, memoryId);

    return {
      content: [{
        type: "text" as const,
        text:
          `✨ SHADOW PROMOTED TO MEMORY\n` +
          `${"─".repeat(50)}\n\n` +
          `Shadow: ${shadow.id}\n` +
          `Topic: ${shadow.topic}\n` +
          `Memory ID: ${memoryId}\n\n` +
          `Summary:\n${summary}\n\n` +
          `Stats: ${shadow.activities.length} activities, ${shadow.tokens} tokens, ${Math.round(getActiveMinutes(shadow))}min`,
      }],
    };
  }
);

/**
 * Helper to record shadow activity from tool usage
 */
function recordToolActivity(
  activityType: "memory_access" | "search" | "tool_use",
  detail: string,
  tokens?: number
): void {
  if (!config.shadow_enabled) return;

  try {
    const sessionId = getCurrentSessionId();
    const activity = createActivity(activityType, detail, tokens);
    recordActivity(sessionId, activity);
  } catch (error) {
    // Silently ignore shadow log errors to not disrupt main functionality
    console.error("Shadow log error:", error);
  }
}

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

  // Initialize shadow log
  if (config.shadow_enabled) {
    initShadowLog();
    // Run decay on startup to clean up old shadows
    const decayed = decayOldShadows();
    if (decayed > 0) {
      console.error(`Shadow log: decayed ${decayed} old entries`);
    }
  }

  // Auto-start session
  await startSession(config.current_project);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Claude Memory MCP Server running.");
  console.error(`Current project: ${config.current_project || "none"}`);
  console.error(`Session: ${getCurrentSessionId()}`);
  if (config.shadow_enabled) {
    console.error("Shadow log: enabled");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
