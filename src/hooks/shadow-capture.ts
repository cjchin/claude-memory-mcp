#!/usr/bin/env npx ts-node
/**
 * Shadow Capture CLI
 *
 * Lightweight CLI for Claude Code hooks to record activity in the shadow log.
 * Can be called from afterToolUse hooks to capture file reads, searches, etc.
 *
 * Usage:
 *   npx ts-node shadow-capture.ts <action> <detail> [session_id]
 *
 * Actions:
 *   read <file_path>     - Record a file read
 *   search <query>       - Record a search operation
 *   bash <command>       - Record a bash command
 *   tool <tool_name>     - Record a tool use
 *
 * Examples:
 *   npx ts-node shadow-capture.ts read "/src/index.ts"
 *   npx ts-node shadow-capture.ts search "function handleError"
 *   npx ts-node shadow-capture.ts bash "npm test"
 *
 * Environment Variables:
 *   CLAUDE_SESSION_ID - Session ID to use (falls back to "default")
 *   SHADOW_LOG_ENABLED - Set to "false" to disable logging
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Types (minimal, self-contained for fast startup)
// ============================================================================

type ShadowActivityType = "file_read" | "search" | "tool_use" | "topic_mention" | "memory_access";
type ShadowStatus = "active" | "idle" | "promoted" | "decayed";

interface ShadowActivity {
  timestamp: string;
  type: ShadowActivityType;
  detail: string;
  tokens?: number;
}

interface ShadowEntry {
  id: string;
  session_id: string;
  topic: string;
  created_at: string;
  last_activity: string;
  activities: ShadowActivity[];
  tokens: number;
  status: ShadowStatus;
  summary?: string;
  project?: string;
  promoted_memory_id?: string;
}

interface ShadowStore {
  version: number;
  entries: ShadowEntry[];
  recently_promoted: Array<{
    shadow_id: string;
    memory_id: string;
    topic: string;
    promoted_at: string;
    token_density: number;
  }>;
  last_cleanup: string;
}

// ============================================================================
// Configuration
// ============================================================================

const SHADOW_DIR = join(homedir(), ".claude-memory");
const SHADOW_FILE = join(SHADOW_DIR, "shadow-log.json");

const ACTION_MAP: Record<string, ShadowActivityType> = {
  read: "file_read",
  search: "search",
  bash: "tool_use",
  tool: "tool_use",
  grep: "search",
  glob: "search",
  mention: "topic_mention",
  memory: "memory_access",
};

// ============================================================================
// Storage Operations
// ============================================================================

function loadStore(): ShadowStore {
  try {
    if (!existsSync(SHADOW_FILE)) {
      return {
        version: 1,
        entries: [],
        recently_promoted: [],
        last_cleanup: new Date().toISOString(),
      };
    }
    const content = readFileSync(SHADOW_FILE, "utf-8");
    return JSON.parse(content) as ShadowStore;
  } catch (error) {
    console.error("Error loading shadow store:", error);
    process.exit(1);
  }
}

function saveStore(store: ShadowStore): void {
  try {
    if (!existsSync(SHADOW_DIR)) {
      mkdirSync(SHADOW_DIR, { recursive: true });
    }
    writeFileSync(SHADOW_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error("Error saving shadow store:", error);
    process.exit(1);
  }
}

// ============================================================================
// Topic Detection (lightweight)
// ============================================================================

function inferTopic(detail: string): string {
  // Extract from file path
  const pathMatch = detail.match(/[/\\]([^/\\]+)[/\\][^/\\]+\.[a-z]+$/i);
  if (pathMatch) {
    return pathMatch[1].toLowerCase();
  }

  // Extract significant word from search
  const words = detail
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);

  if (words.length > 0) {
    return words[0];
  }

  return "general";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `shadow_${timestamp}_${random}`;
}

// ============================================================================
// Main Logic
// ============================================================================

function recordActivity(
  sessionId: string,
  activityType: ShadowActivityType,
  detail: string
): void {
  const store = loadStore();

  // Find or create shadow entry
  const topic = inferTopic(detail);
  let shadow = store.entries.find(
    (e) =>
      e.session_id === sessionId && e.topic === topic && e.status === "active"
  );

  const activity: ShadowActivity = {
    timestamp: new Date().toISOString(),
    type: activityType,
    detail,
    tokens: estimateTokens(detail),
  };

  if (!shadow) {
    // Limit max entries
    const activeCount = store.entries.filter((e) => e.status === "active").length;
    if (activeCount >= 20) {
      // Mark oldest as idle
      const oldest = store.entries
        .filter((e) => e.status === "active")
        .sort(
          (a, b) =>
            new Date(a.last_activity).getTime() -
            new Date(b.last_activity).getTime()
        )[0];
      if (oldest) {
        oldest.status = "idle";
      }
    }

    shadow = {
      id: generateId(),
      session_id: sessionId,
      topic,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      activities: [],
      tokens: 0,
      status: "active",
    };
    store.entries.push(shadow);
  }

  // Add activity
  shadow.activities.push(activity);
  shadow.last_activity = new Date().toISOString();
  shadow.tokens += activity.tokens || 0;

  saveStore(store);

  // Output for debugging
  console.log(`Shadow: ${shadow.topic} (+${activity.tokens} tokens, total: ${shadow.tokens})`);
}

function showUsage(): void {
  console.log(`
Shadow Capture CLI - Record activity in the shadow log

Usage:
  npx ts-node shadow-capture.ts <action> <detail> [session_id]

Actions:
  read <file_path>     - Record a file read
  search <query>       - Record a search operation
  bash <command>       - Record a bash command
  tool <tool_name>     - Record a tool use

Environment Variables:
  CLAUDE_SESSION_ID    - Session ID (default: "default")
  SHADOW_LOG_ENABLED   - Set to "false" to disable

Examples:
  npx ts-node shadow-capture.ts read "/src/index.ts"
  npx ts-node shadow-capture.ts search "handleError"
`);
}

function main(): void {
  // Check if disabled
  if (process.env.SHADOW_LOG_ENABLED === "false") {
    process.exit(0);
  }

  const args = process.argv.slice(2);

  if (args.length < 2) {
    showUsage();
    process.exit(1);
  }

  const [action, detail, sessionIdArg] = args;

  const activityType = ACTION_MAP[action.toLowerCase()];
  if (!activityType) {
    console.error(`Unknown action: ${action}`);
    console.error(`Valid actions: ${Object.keys(ACTION_MAP).join(", ")}`);
    process.exit(1);
  }

  // Session ID priority: arg > env > default
  const sessionId =
    sessionIdArg ||
    process.env.CLAUDE_SESSION_ID ||
    `cli_${process.pid}_${Date.now().toString(36)}`;

  recordActivity(sessionId, activityType, detail);
}

// Run
main();
