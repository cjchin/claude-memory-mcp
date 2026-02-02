/**
 * LLM Abstraction Layer
 * 
 * Provides a unified interface for LLM interactions, supporting both:
 * - Local models (Ollama, llama.cpp, LM Studio)
 * - Remote APIs (OpenAI, Anthropic, OpenRouter)
 * 
 * Used by both conscious (interactive) and unconscious (dream) processing.
 */

import { config, type LLMConfig } from "./config.js";

// ============================================================================
// Types
// ============================================================================

// Re-export LLMConfig from config.ts
export type { LLMConfig };

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: number;
}

export interface LLMProvider {
  name: string;
  model: string;
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

// ============================================================================
// Provider Implementations
// ============================================================================

/**
 * Ollama - Local LLM server
 * Default: http://localhost:11434
 * Supports: llama, mistral, deepseek, etc.
 */
export class OllamaProvider implements LLMProvider {
  name = "ollama";
  
  constructor(private config: { host: string; model: string }) {}

  get model() { return this.config.model; }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.host}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.config.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt: options?.systemPrompt 
          ? `${options.systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`
          : prompt,
        stream: false,
        options: {
          num_predict: options?.maxTokens || 1024,
          temperature: options?.temperature ?? 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.response,
      model: this.config.model,
      tokensUsed: data.eval_count,
    };
  }
}

/**
 * LM Studio - Local server with OpenAI-compatible API
 * Default: http://localhost:1234/v1
 */
export class LMStudioProvider implements LLMProvider {
  name = "lmstudio";

  constructor(private config: { host: string; model: string }) {}

  get model() { return this.config.model; }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.host}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const messages = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.config.host}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

/**
 * OpenAI-compatible API provider
 * Works with: OpenAI, Azure OpenAI, Together, Groq, etc.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  name: string;

  constructor(private config: { 
    name: string;
    baseUrl: string; 
    apiKey: string; 
    model: string;
  }) {
    this.name = config.name;
  }

  get model() { return this.config.model; }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const messages = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body: any = {
      model: this.config.model,
      messages,
      max_tokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.3,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

/**
 * Anthropic Claude API
 */
export class AnthropicProvider implements LLMProvider {
  name = "anthropic";

  constructor(private config: { apiKey: string; model: string }) {}

  get model() { return this.config.model; }

  async isAvailable(): Promise<boolean> {
    // Anthropic doesn't have a simple health check endpoint
    return !!this.config.apiKey;
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options?.maxTokens || 1024,
        system: options?.systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      model: data.model,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    };
  }
}

/**
 * OpenRouter - Multi-model API gateway
 * Provides access to many models through one API
 */
export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";

  constructor(private config: { apiKey: string; model: string }) {}

  get model() { return this.config.model; }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const messages = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://github.com/yourusername/soul-mcp",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

// ============================================================================
// Factory and Configuration
// ============================================================================

// Default models for each provider
const DEFAULT_MODELS: Record<string, string> = {
  ollama: "deepseek-coder:6.7b",  // Good for technical judgment
  lmstudio: "local-model",        // LM Studio loads whatever is active
  openai: "gpt-4o-mini",          // Cost effective
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "anthropic/claude-sonnet-4",
};

let cachedProvider: LLMProvider | null = null;

/**
 * Clear the cached LLM provider (for testing)
 */
export function clearLLMProviderCache(): void {
  cachedProvider = null;
}

/**
 * Get the configured LLM provider based on config.
 * Returns null if no LLM is configured.
 */
export function getLLMProvider(forceRefresh = false): LLMProvider | null {
  if (cachedProvider && !forceRefresh) {
    return cachedProvider;
  }

  // Clear cached provider when force refreshing
  if (forceRefresh) {
    cachedProvider = null;
  }

  const llmConfig = (config as any).llm as LLMConfig | undefined;
  if (!llmConfig) {
    cachedProvider = null;
    return null;
  }

  const getModel = (provider: string) => llmConfig.model || DEFAULT_MODELS[provider] || "unknown";

  switch (llmConfig.provider) {
    case "ollama":
      cachedProvider = new OllamaProvider({
        host: llmConfig.baseUrl || "http://localhost:11434",
        model: getModel("ollama"),
      });
      break;

    case "lmstudio":
      cachedProvider = new LMStudioProvider({
        host: llmConfig.baseUrl || "http://localhost:1234/v1",
        model: getModel("lmstudio"),
      });
      break;

    case "openai":
      if (!llmConfig.apiKey) {
        console.error("OpenAI provider requires apiKey in config");
        return null;
      }
      cachedProvider = new OpenAICompatibleProvider({
        name: "openai",
        baseUrl: llmConfig.baseUrl || "https://api.openai.com/v1",
        apiKey: llmConfig.apiKey,
        model: getModel("openai"),
      });
      break;

    case "anthropic":
      if (!llmConfig.apiKey) {
        console.error("Anthropic provider requires apiKey in config");
        return null;
      }
      cachedProvider = new AnthropicProvider({
        apiKey: llmConfig.apiKey,
        model: getModel("anthropic"),
      });
      break;

    case "openrouter":
      if (!llmConfig.apiKey) {
        console.error("OpenRouter provider requires apiKey in config");
        return null;
      }
      cachedProvider = new OpenRouterProvider({
        apiKey: llmConfig.apiKey,
        model: getModel("openrouter"),
      });
      break;

    case "custom":
      if (!llmConfig.baseUrl || !llmConfig.apiKey) {
        console.error("Custom provider requires baseUrl and apiKey");
        return null;
      }
      cachedProvider = new OpenAICompatibleProvider({
        name: "custom",
        baseUrl: llmConfig.baseUrl,
        apiKey: llmConfig.apiKey,
        model: getModel("custom"),
      });
      break;

    default:
      console.error(`Unknown LLM provider: ${llmConfig.provider}`);
      return null;
  }

  return cachedProvider;
}

/**
 * Check if an LLM provider is configured and available
 */
export async function isLLMAvailable(): Promise<boolean> {
  const provider = getLLMProvider();
  if (!provider) return false;
  return provider.isAvailable();
}

// ============================================================================
// Dream Processing Prompts
// ============================================================================

const SYSTEM_PROMPT_JUDGE = `You are a memory management system evaluating memories for contradiction or consolidation.
Be precise, factual, and conservative. When in doubt, preserve memories rather than delete them.
Respond ONLY with valid JSON matching the requested schema.`;

export interface ContradictionJudgment {
  isRealConflict: boolean;
  conflictType: "temporal_supersession" | "direct_contradiction" | "context_dependent" | "false_positive";
  resolution: "supersede_a" | "supersede_b" | "keep_both" | "merge";
  mergedContent?: string;
  reasoning: string;
  confidence: number;
}

export interface ConsolidationJudgment {
  shouldMerge: boolean;
  mergedContent?: string;
  mergedTags: string[];
  importance: number;
  reasoning: string;
  confidence: number;
}

/**
 * Use LLM to evaluate whether a contradiction is real and how to resolve it
 */
export async function judgeContradiction(
  memoryA: { id: string; content: string; type: string; timestamp: string; importance: number },
  memoryB: { id: string; content: string; type: string; timestamp: string; importance: number },
  heuristicExplanation?: string,
  provider?: LLMProvider
): Promise<ContradictionJudgment> {
  const llm = provider || getLLMProvider();
  const explanation = heuristicExplanation || "Possible conflict detected by similarity";
  
  if (!llm) {
    // Fallback to heuristic judgment
    return {
      isRealConflict: true,
      conflictType: "temporal_supersession",
      resolution: new Date(memoryA.timestamp) > new Date(memoryB.timestamp) ? "supersede_b" : "supersede_a",
      reasoning: "LLM unavailable, using heuristic: newer memory supersedes older",
      confidence: 0.5,
    };
  }

  const prompt = `Evaluate these two memories for contradiction:

MEMORY A (${memoryA.type}, created ${memoryA.timestamp}, importance ${memoryA.importance}):
"${memoryA.content}"

MEMORY B (${memoryB.type}, created ${memoryB.timestamp}, importance ${memoryB.importance}):
"${memoryB.content}"

HEURISTIC ANALYSIS: ${explanation}

Determine:
1. Is this a REAL conflict, or can both be true in different contexts?
2. If real conflict, which should be kept? (newer usually wins for temporal, more specific wins otherwise)
3. Could they be merged into a single coherent memory?

Respond with JSON:
{
  "isRealConflict": boolean,
  "conflictType": "temporal_supersession" | "direct_contradiction" | "context_dependent" | "false_positive",
  "resolution": "supersede_a" | "supersede_b" | "keep_both" | "merge",
  "mergedContent": "string if merge, otherwise omit",
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await llm.complete(prompt, {
      systemPrompt: SYSTEM_PROMPT_JUDGE,
      maxTokens: 500,
      temperature: 0.2,
      jsonMode: true,
    });

    // Parse JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    return JSON.parse(jsonMatch[0]) as ContradictionJudgment;
  } catch (error) {
    console.error("LLM judgment failed, using heuristic:", error);
    return {
      isRealConflict: true,
      conflictType: "temporal_supersession",
      resolution: new Date(memoryA.timestamp) > new Date(memoryB.timestamp) ? "supersede_b" : "supersede_a",
      reasoning: `LLM error: ${error}. Falling back to heuristic.`,
      confidence: 0.4,
    };
  }
}

/**
 * Use LLM to evaluate and synthesize a consolidation
 */
export async function judgeConsolidation(
  memories: Array<{ id: string; content: string; type: string; tags: string[]; importance: number }>,
  heuristicMerge?: string,
  provider?: LLMProvider
): Promise<ConsolidationJudgment> {
  const llm = provider || getLLMProvider();
  const fallbackMerge = heuristicMerge || memories.reduce((a, b) => 
    a.content.length > b.content.length ? a : b
  ).content;
  
  if (!llm) {
    // Fallback to heuristic
    return {
      shouldMerge: true,
      mergedContent: fallbackMerge,
      mergedTags: [...new Set(memories.flatMap(m => m.tags))],
      importance: Math.max(...memories.map(m => m.importance)),
      reasoning: "LLM unavailable, using heuristic merge (longest content)",
      confidence: 0.5,
    };
  }

  const memoriesText = memories.map((m, i) => 
    `MEMORY ${i + 1} (${m.type}, importance ${m.importance}, tags: ${m.tags.join(", ") || "none"}):\n"${m.content}"`
  ).join("\n\n");

  const prompt = `Evaluate these similar memories for consolidation:

${memoriesText}

HEURISTIC MERGE SUGGESTION:
"${fallbackMerge}"

Determine:
1. Should these be merged, or are they distinct enough to keep separate?
2. If merging, what should the combined content be? (preserve all unique information)
3. What tags best describe the merged memory?
4. What importance level (1-5)?

Respond with JSON:
{
  "shouldMerge": boolean,
  "mergedContent": "synthesized content if merging",
  "mergedTags": ["tag1", "tag2"],
  "importance": 1-5,
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await llm.complete(prompt, {
      systemPrompt: SYSTEM_PROMPT_JUDGE,
      maxTokens: 800,
      temperature: 0.2,
      jsonMode: true,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    return JSON.parse(jsonMatch[0]) as ConsolidationJudgment;
  } catch (error) {
    console.error("LLM consolidation judgment failed, using heuristic:", error);
    return {
      shouldMerge: true,
      mergedContent: heuristicMerge,
      mergedTags: [...new Set(memories.flatMap(m => m.tags))],
      importance: Math.max(...memories.map(m => m.importance)),
      reasoning: `LLM error: ${error}. Using heuristic merge.`,
      confidence: 0.4,
    };
  }
}

// ============================================================================
// Exports are defined inline with declarations above
// ============================================================================
