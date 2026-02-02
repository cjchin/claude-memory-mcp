/**
 * Introspection Tools - Metacognition
 *
 * Enables the soul to examine itself:
 * - introspect: Examine capabilities, aspirations, and gaps
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { introspect as runIntrospection, getFeatureStatus, loadManifest } from "../introspect.js";

export function registerIntrospectTools(server: McpServer): void {
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
  
}
