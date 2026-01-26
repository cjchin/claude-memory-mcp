import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface LLMConfig {
  provider: "ollama" | "openai" | "anthropic" | "openrouter" | "lmstudio" | "custom";
  baseUrl?: string;
  apiKey?: string;
  model?: string;  // Optional, defaults vary by provider
  maxTokens?: number;
  temperature?: number;
}

export interface Config {
  // ChromaDB connection
  chroma_host: string;
  chroma_port: number;

  // Embedding model
  embedding_model: string;

  // Memory settings
  default_importance: number;
  max_context_memories: number;  // Max memories to inject as context
  context_relevance_threshold: number;  // Min similarity score (0-1)

  // Session settings
  auto_summarize_sessions: boolean;
  session_summary_min_memories: number;

  // Memory decay
  enable_memory_decay: boolean;
  decay_half_life_days: number;

  // LLM for unconscious processing (dream state)
  llm?: LLMConfig;
  dream_use_llm: boolean;  // Enable LLM judgment in dream operations

  // Shadow log settings (ephemeral working memory)
  shadow_enabled: boolean;           // Enable shadow log tracking
  shadow_token_threshold: number;    // Promote at N tokens (default: 500)
  shadow_time_threshold_min: number; // Promote after N minutes active (default: 30)
  shadow_idle_timeout_min: number;   // Mark idle after N minutes (default: 10)
  shadow_decay_hours: number;        // Decay orphans after N hours (default: 24)
  shadow_max_entries: number;        // Max concurrent shadows (default: 20)

  // Projects
  current_project?: string;
  projects: Record<string, { description?: string; tech_stack?: string[] }>;
}

const DEFAULT_CONFIG: Config = {
  chroma_host: "localhost",
  chroma_port: 8000,
  embedding_model: "Xenova/all-MiniLM-L6-v2",
  default_importance: 3,
  max_context_memories: 10,
  context_relevance_threshold: 0.3,
  auto_summarize_sessions: true,
  session_summary_min_memories: 3,
  enable_memory_decay: true,
  decay_half_life_days: 30,
  dream_use_llm: false,  // Disabled by default until configured
  // Shadow log defaults
  shadow_enabled: true,            // Enabled by default
  shadow_token_threshold: 500,     // Promote at 500 tokens
  shadow_time_threshold_min: 30,   // Promote after 30 minutes active
  shadow_idle_timeout_min: 10,     // Mark idle after 10 minutes
  shadow_decay_hours: 24,          // Decay after 24 hours
  shadow_max_entries: 20,          // Max 20 concurrent shadows
  projects: {},
};

const CONFIG_DIR = join(homedir(), ".claude-memory");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    }
  } catch (error) {
    console.error("Error loading config, using defaults:", error);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Config): void {
  try {
    const { mkdirSync } = require("fs");
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

export function updateConfig(updates: Partial<Config>): Config {
  const config = loadConfig();
  const updated = { ...config, ...updates };
  saveConfig(updated);
  return updated;
}

export const config = loadConfig();
