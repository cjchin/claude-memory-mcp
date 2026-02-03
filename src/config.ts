import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";

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
  shadow_deduplicate: boolean;       // Deduplicate repeated activities (default: true)
  shadow_surface_in_prime: boolean;  // Show promotion candidates in prime (default: true)
  shadow_surface_in_conclude: boolean; // Show shadows in conclude (default: true)
  shadow_surface_threshold: number;  // Min % of threshold to surface (default: 0.6)

  // Projects
  current_project?: string;
  projects: Record<string, { description?: string; tech_stack?: string[] }>;

  // Multi-agent settings (v3.0 Phase 3)
  current_agent_id?: string;     // Agent ID for the current user/system
  current_agent_type?: "claude" | "human" | "walker" | "custom";
}

/**
 * Zod schema for config validation.
 * Validates user-provided config values and coerces types where safe.
 */
const LLMConfigSchema = z.object({
  provider: z.enum(["ollama", "openai", "anthropic", "openrouter", "lmstudio", "custom"]),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const ConfigSchema = z.object({
  chroma_host: z.string().min(1),
  chroma_port: z.number().int().min(1).max(65535),
  embedding_model: z.string().min(1),
  default_importance: z.number().int().min(1).max(5),
  max_context_memories: z.number().int().positive(),
  context_relevance_threshold: z.number().min(0).max(1),
  auto_summarize_sessions: z.boolean(),
  session_summary_min_memories: z.number().int().nonnegative(),
  enable_memory_decay: z.boolean(),
  decay_half_life_days: z.number().positive(),
  llm: LLMConfigSchema.optional(),
  dream_use_llm: z.boolean(),
  shadow_enabled: z.boolean(),
  shadow_token_threshold: z.number().int().positive(),
  shadow_time_threshold_min: z.number().positive(),
  shadow_idle_timeout_min: z.number().positive(),
  shadow_decay_hours: z.number().positive(),
  shadow_max_entries: z.number().int().positive(),
  shadow_deduplicate: z.boolean(),
  shadow_surface_in_prime: z.boolean(),
  shadow_surface_in_conclude: z.boolean(),
  shadow_surface_threshold: z.number().min(0).max(1),
  current_project: z.string().optional(),
  projects: z.record(z.object({
    description: z.string().optional(),
    tech_stack: z.array(z.string()).optional(),
  })),
  current_agent_id: z.string().optional(),
  current_agent_type: z.enum(["claude", "human", "walker", "custom"]).optional(),
}).passthrough();

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
  shadow_deduplicate: true,        // Deduplicate repeated activities
  shadow_surface_in_prime: true,   // Show promotion candidates in prime
  shadow_surface_in_conclude: true, // Show shadows in conclude
  shadow_surface_threshold: 0.6,   // Surface at 60% of threshold
  projects: {},
  // Multi-agent defaults
  current_agent_id: "human_user",   // Default agent ID
  current_agent_type: "human",      // Default agent type
};

const CONFIG_DIR = join(homedir(), ".claude-memory");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      const merged = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
      const result = ConfigSchema.safeParse(merged);
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        console.error(`Config validation warnings (using defaults for invalid fields):\n${issues}`);
        // Fall back to defaults for invalid fields by re-merging only valid values
        const validPartial: Record<string, any> = {};
        const raw = JSON.parse(content);
        for (const key of Object.keys(raw)) {
          const testObj = { ...DEFAULT_CONFIG, [key]: raw[key] };
          const fieldResult = ConfigSchema.safeParse(testObj);
          if (fieldResult.success) {
            validPartial[key] = raw[key];
          }
        }
        return { ...DEFAULT_CONFIG, ...validPartial };
      }
      return result.data as Config;
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
