import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initEmbeddings } from "./embeddings.js";
import {
  initDb,
  searchMemories,
  listMemories,
  listProjects,
  startSession,
  getCurrentSessionId,
} from "./db.js";
import { config } from "./config.js";
import type { Memory } from "./types.js";
import {
  initShadowLog,
  decayOldShadows,
} from "./shadow-log.js";
import {
  registerShadowTools,
  registerSessionTools,
  registerProjectTools,
  registerUtilityTools,
  registerCoreTools,
  registerIntrospectTools,
  registerLlmTools,
  registerGraphTools,
  registerPolicyTools,
  registerDreamTools,
  registerAutonomousTools,
  registerConsolidationTools,
} from "./tools/index.js";

const server = new McpServer({
  name: "claude-memory",
  version: "1.0.0",
});

// Register all tool modules
registerSessionTools(server);
registerProjectTools(server);
registerUtilityTools(server);
registerShadowTools(server);
registerCoreTools(server);
registerIntrospectTools(server);
registerLlmTools(server);
registerGraphTools(server);
registerConsolidationTools(server);
registerPolicyTools(server);
registerDreamTools(server);
registerAutonomousTools(server);

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
