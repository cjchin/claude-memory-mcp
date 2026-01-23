import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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
