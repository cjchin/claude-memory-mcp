/**
 * Shadow Log Module
 *
 * Implements ephemeral working memory that accumulates activity traces
 * and promotes to long-term memories based on density thresholds.
 *
 * Storage: JSON file (lightweight, no external dependencies)
 * Location: ~/.claude-memory/shadow-log.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { config } from "./config.js";
import { detectTags } from "./intelligence.js";
import type {
  ShadowEntry,
  ShadowActivity,
  ShadowActivityType,
  ShadowStatus
} from "./types.js";

// ============================================================================
// Storage Configuration
// ============================================================================

const SHADOW_DIR = join(homedir(), ".claude-memory");
const SHADOW_FILE = join(SHADOW_DIR, "shadow-log.json");

interface ShadowStore {
  version: number;
  entries: ShadowEntry[];
  recently_promoted: RecentlyPromoted[];
  last_cleanup: string;
}

interface RecentlyPromoted {
  shadow_id: string;
  memory_id: string;
  topic: string;
  promoted_at: string;
  token_density: number;
}

const EMPTY_STORE: ShadowStore = {
  version: 1,
  entries: [],
  recently_promoted: [],
  last_cleanup: new Date().toISOString(),
};

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Initialize the shadow log storage
 */
export function initShadowLog(): void {
  if (!existsSync(SHADOW_DIR)) {
    mkdirSync(SHADOW_DIR, { recursive: true });
  }

  if (!existsSync(SHADOW_FILE)) {
    writeFileSync(SHADOW_FILE, JSON.stringify(EMPTY_STORE, null, 2));
  }
}

/**
 * Load the shadow store from disk
 */
function loadStore(): ShadowStore {
  try {
    if (!existsSync(SHADOW_FILE)) {
      initShadowLog();
      return EMPTY_STORE;
    }
    const content = readFileSync(SHADOW_FILE, "utf-8");
    return JSON.parse(content) as ShadowStore;
  } catch (error) {
    console.error("Error loading shadow store:", error);
    return EMPTY_STORE;
  }
}

/**
 * Save the shadow store to disk
 */
function saveStore(store: ShadowStore): void {
  try {
    initShadowLog();
    writeFileSync(SHADOW_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error("Error saving shadow store:", error);
  }
}

// ============================================================================
// Shadow Entry Operations
// ============================================================================

/**
 * Generate a unique shadow ID
 */
function generateShadowId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `shadow_${timestamp}_${random}`;
}

/**
 * Record an activity in the shadow log
 */
export function recordActivity(
  sessionId: string,
  activity: ShadowActivity,
  topic?: string
): ShadowEntry {
  if (!config.shadow_enabled) {
    throw new Error("Shadow log is disabled");
  }

  const store = loadStore();

  // Find or create shadow entry for this session/topic
  const inferredTopic = topic || inferTopic([activity]);
  let shadow = store.entries.find(
    (e) => e.session_id === sessionId &&
           e.topic === inferredTopic &&
           e.status === "active"
  );

  if (!shadow) {
    // Check max entries limit
    const activeCount = store.entries.filter(e => e.status === "active").length;
    if (activeCount >= config.shadow_max_entries) {
      // Mark oldest active shadow as idle
      const oldest = store.entries
        .filter(e => e.status === "active")
        .sort((a, b) => new Date(a.last_activity).getTime() - new Date(b.last_activity).getTime())[0];
      if (oldest) {
        oldest.status = "idle";
      }
    }

    shadow = {
      id: generateShadowId(),
      session_id: sessionId,
      topic: inferredTopic,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      activities: [],
      tokens: 0,
      status: "active",
      project: config.current_project,
    };
    store.entries.push(shadow);
  }

  // Add activity
  shadow.activities.push(activity);
  shadow.last_activity = new Date().toISOString();
  shadow.tokens += activity.tokens || estimateTokens(activity.detail);

  saveStore(store);
  return shadow;
}

/**
 * Get a shadow entry by ID
 */
export function getShadowById(shadowId: string): ShadowEntry | null {
  const store = loadStore();
  return store.entries.find(e => e.id === shadowId) || null;
}

/**
 * Get the active shadow for a session, optionally filtered by topic
 */
export function getShadowEntry(
  sessionId: string,
  topic?: string
): ShadowEntry | null {
  const store = loadStore();

  if (topic) {
    return store.entries.find(
      (e) => e.session_id === sessionId &&
             e.topic === topic &&
             e.status === "active"
    ) || null;
  }

  // Return most recent active shadow for session
  const sessionShadows = store.entries
    .filter(e => e.session_id === sessionId && e.status === "active")
    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());

  return sessionShadows[0] || null;
}

/**
 * List all active shadows (across all sessions)
 */
export function listActiveShadows(): ShadowEntry[] {
  const store = loadStore();

  // First, update status of idle shadows
  const now = new Date();
  const idleTimeoutMs = config.shadow_idle_timeout_min * 60 * 1000;

  for (const shadow of store.entries) {
    if (shadow.status === "active") {
      const lastActivity = new Date(shadow.last_activity);
      if (now.getTime() - lastActivity.getTime() > idleTimeoutMs) {
        shadow.status = "idle";
      }
    }
  }

  saveStore(store);

  return store.entries
    .filter(e => e.status === "active" || e.status === "idle")
    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
}

/**
 * Get all shadows for a specific session
 */
export function getSessionShadows(sessionId: string): ShadowEntry[] {
  const store = loadStore();
  return store.entries
    .filter(e => e.session_id === sessionId && (e.status === "active" || e.status === "idle"))
    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
}

// ============================================================================
// Promotion Logic
// ============================================================================

/**
 * Check which shadows are ready for promotion
 */
export function checkPromotionThresholds(): ShadowEntry[] {
  const store = loadStore();
  const candidates: ShadowEntry[] = [];

  for (const shadow of store.entries) {
    if (shadow.status !== "active" && shadow.status !== "idle") continue;

    const activeMinutes = getActiveMinutes(shadow);
    const shouldPromote =
      shadow.tokens >= config.shadow_token_threshold ||
      activeMinutes >= config.shadow_time_threshold_min;

    if (shouldPromote) {
      candidates.push(shadow);
    }
  }

  return candidates;
}

/**
 * Get minutes since shadow creation
 */
export function getActiveMinutes(shadow: ShadowEntry): number {
  const created = new Date(shadow.created_at);
  const lastActivity = new Date(shadow.last_activity);
  return (lastActivity.getTime() - created.getTime()) / (1000 * 60);
}

/**
 * Mark a shadow as promoted and record the memory ID
 */
export function markShadowPromoted(shadowId: string, memoryId: string): void {
  const store = loadStore();
  const shadow = store.entries.find(e => e.id === shadowId);

  if (shadow) {
    shadow.status = "promoted";
    shadow.promoted_memory_id = memoryId;

    // Add to recently promoted list
    store.recently_promoted.push({
      shadow_id: shadowId,
      memory_id: memoryId,
      topic: shadow.topic,
      promoted_at: new Date().toISOString(),
      token_density: shadow.tokens,
    });

    // Keep only last 10 recently promoted
    if (store.recently_promoted.length > 10) {
      store.recently_promoted = store.recently_promoted.slice(-10);
    }

    saveStore(store);
  }
}

/**
 * Get recently promoted shadows
 */
export function getRecentlyPromoted(): RecentlyPromoted[] {
  const store = loadStore();
  return store.recently_promoted;
}

/**
 * Generate a summary of shadow activities for promotion
 */
export function generateShadowSummary(shadow: ShadowEntry): string {
  const activityCounts: Record<ShadowActivityType, number> = {
    file_read: 0,
    search: 0,
    tool_use: 0,
    topic_mention: 0,
    memory_access: 0,
  };

  const uniqueDetails: Set<string> = new Set();

  for (const activity of shadow.activities) {
    activityCounts[activity.type]++;

    // Extract meaningful details
    if (activity.type === "file_read") {
      // Extract just the filename
      const filename = activity.detail.split(/[/\\]/).pop() || activity.detail;
      uniqueDetails.add(filename);
    } else if (activity.type === "search") {
      uniqueDetails.add(`searched: "${activity.detail}"`);
    } else if (activity.type === "memory_access") {
      uniqueDetails.add(activity.detail);
    }
  }

  const parts: string[] = [];
  parts.push(`Working session on "${shadow.topic}"`);

  const activitySummary: string[] = [];
  if (activityCounts.file_read > 0) activitySummary.push(`${activityCounts.file_read} file reads`);
  if (activityCounts.search > 0) activitySummary.push(`${activityCounts.search} searches`);
  if (activityCounts.memory_access > 0) activitySummary.push(`${activityCounts.memory_access} memory accesses`);
  if (activityCounts.tool_use > 0) activitySummary.push(`${activityCounts.tool_use} tool uses`);

  if (activitySummary.length > 0) {
    parts.push(`Activity: ${activitySummary.join(", ")}`);
  }

  const activeMin = Math.round(getActiveMinutes(shadow));
  parts.push(`Duration: ${activeMin} minutes, ${shadow.tokens} tokens`);

  // Add key details (limited)
  const keyDetails = Array.from(uniqueDetails).slice(0, 5);
  if (keyDetails.length > 0) {
    parts.push(`Key items: ${keyDetails.join(", ")}`);
  }

  return parts.join(". ");
}

// ============================================================================
// Cleanup and Decay
// ============================================================================

/**
 * Decay old shadows that haven't been promoted
 */
export function decayOldShadows(): number {
  const store = loadStore();
  const now = new Date();
  const decayTimeoutMs = config.shadow_decay_hours * 60 * 60 * 1000;

  let decayedCount = 0;

  for (const shadow of store.entries) {
    if (shadow.status === "active" || shadow.status === "idle") {
      const lastActivity = new Date(shadow.last_activity);
      if (now.getTime() - lastActivity.getTime() > decayTimeoutMs) {
        shadow.status = "decayed";
        decayedCount++;
      }
    }
  }

  // Remove decayed and promoted entries older than 7 days
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  store.entries = store.entries.filter(
    (e) => e.status === "active" ||
           e.status === "idle" ||
           new Date(e.last_activity).getTime() > sevenDaysAgo
  );

  store.last_cleanup = now.toISOString();
  saveStore(store);

  return decayedCount;
}

/**
 * Finalize a shadow (mark as idle, generate summary)
 */
export function finalizeShadow(shadowId: string): ShadowEntry | null {
  const store = loadStore();
  const shadow = store.entries.find(e => e.id === shadowId);

  if (shadow && shadow.status === "active") {
    shadow.status = "idle";
    shadow.summary = generateShadowSummary(shadow);
    saveStore(store);
    return shadow;
  }

  return shadow || null;
}

// ============================================================================
// Topic Detection
// ============================================================================

/**
 * Infer topic from accumulated activities
 */
export function inferTopic(activities: ShadowActivity[]): string {
  if (activities.length === 0) return "general";

  // Collect all details
  const allDetails = activities.map(a => a.detail).join(" ");

  // Use tag detection as a proxy for topic inference
  const tags = detectTags(allDetails);
  if (tags.length > 0) {
    return tags[0]; // Most relevant tag becomes the topic
  }

  // Extract common path segments from file reads
  const fileReads = activities.filter(a => a.type === "file_read");
  if (fileReads.length > 0) {
    const pathSegments: Record<string, number> = {};
    for (const activity of fileReads) {
      const segments = activity.detail.split(/[/\\]/);
      for (const segment of segments) {
        if (segment && !segment.includes(".") && segment.length > 2) {
          pathSegments[segment] = (pathSegments[segment] || 0) + 1;
        }
      }
    }

    // Find most common segment
    const sorted = Object.entries(pathSegments)
      .sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] >= 2) {
      return sorted[0][0];
    }
  }

  // Check search queries
  const searches = activities.filter(a => a.type === "search");
  if (searches.length > 0) {
    // Use first significant search term
    const firstSearch = searches[0].detail;
    const words = firstSearch.split(/\s+/).filter(w => w.length > 3);
    if (words.length > 0) {
      return words[0].toLowerCase();
    }
  }

  return "general";
}

/**
 * Update topic for an existing shadow based on new activities
 */
export function updateShadowTopic(shadowId: string): string | null {
  const store = loadStore();
  const shadow = store.entries.find(e => e.id === shadowId);

  if (shadow) {
    const newTopic = inferTopic(shadow.activities);
    if (newTopic !== shadow.topic && newTopic !== "general") {
      shadow.topic = newTopic;
      saveStore(store);
    }
    return shadow.topic;
  }

  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate tokens for a piece of text
 * Rough approximation: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create an activity record
 */
export function createActivity(
  type: ShadowActivityType,
  detail: string,
  tokens?: number
): ShadowActivity {
  return {
    timestamp: new Date().toISOString(),
    type,
    detail,
    tokens: tokens || estimateTokens(detail),
  };
}

/**
 * Get shadow statistics
 */
export function getShadowStats(): {
  total: number;
  active: number;
  idle: number;
  promoted: number;
  decayed: number;
  totalTokens: number;
} {
  const store = loadStore();

  const stats = {
    total: store.entries.length,
    active: 0,
    idle: 0,
    promoted: 0,
    decayed: 0,
    totalTokens: 0,
  };

  for (const entry of store.entries) {
    stats[entry.status]++;
    if (entry.status === "active" || entry.status === "idle") {
      stats.totalTokens += entry.tokens;
    }
  }

  return stats;
}

/**
 * Clear all shadow entries (for testing)
 */
export function clearShadowLog(): void {
  saveStore(EMPTY_STORE);
}

/**
 * Export the shadow store for debugging
 */
export function exportShadowStore(): ShadowStore {
  return loadStore();
}
