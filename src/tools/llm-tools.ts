/**
 * LLM Configuration Tools
 *
 * Configure and monitor LLM providers for enhanced dream processing:
 * - configure_llm: Set up LLM provider for dream operations
 * - llm_status: Check current LLM configuration and availability
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config, updateConfig } from "../config.js";
import { getLLMProvider, isLLMAvailable, type LLMConfig } from "../llm.js";

export function registerLlmTools(server: McpServer): void {
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

        try {
          await updateConfig({
            dream_use_llm: enable,
            llm: llmConfig,
          });
        } catch (e) {
          // Config update failed, still in memory
        }

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
}
