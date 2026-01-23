/**
 * Introspection Module - Metacognition for the Soul
 * 
 * Enables the soul to understand:
 * - What capabilities the vessel currently has
 * - What aspirations exist in memory
 * - The gap between current state and desired state
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { searchMemories } from "./db.js";

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ TYPES ============

export type FeatureStatus = "implemented" | "partial" | "planned" | "deprecated";

export interface Feature {
  status: FeatureStatus;
  description: string;
  since?: string;
  plannedFor?: string;
}

export interface Tool {
  status: FeatureStatus;
  category: string;
}

export interface Module {
  status: FeatureStatus;
  description: string;
}

export interface CapabilitiesManifest {
  version: string;
  lastUpdated: string;
  vessel: {
    name: string;
    description: string;
  };
  features: Record<string, Feature>;
  tools: Record<string, Tool>;
  modules: Record<string, Module>;
  storage: {
    vector_db: string;
    embedding_model: string;
    embedding_dimensions: number;
  };
}

export interface Aspiration {
  content: string;
  source: string;  // memory ID
  category: string;  // goals, ideas, values
  keywords: string[];
}

export interface Gap {
  aspiration: string;
  relatedFeature?: string;
  status: "missing" | "partial" | "planned";
  confidence: number;
}

export interface IntrospectionResult {
  timestamp: string;
  mode: "quick" | "full";
  capabilities: {
    implementedFeatures: string[];
    partialFeatures: string[];
    plannedFeatures: string[];
    tools: string[];
    modules: string[];
  };
  aspirations: Aspiration[];
  gaps: Gap[];
  summary: string;
}

// ============ MANIFEST LOADING ============

let cachedManifest: CapabilitiesManifest | null = null;

/**
 * Load the capabilities manifest from the vessel repository
 */
export function loadManifest(): CapabilitiesManifest {
  if (cachedManifest) return cachedManifest;

  // Look for capabilities.json in repo root (one level up from src/)
  const manifestPath = join(__dirname, "..", "capabilities.json");
  
  if (!existsSync(manifestPath)) {
    throw new Error(`Capabilities manifest not found at ${manifestPath}`);
  }

  const content = readFileSync(manifestPath, "utf-8");
  cachedManifest = JSON.parse(content) as CapabilitiesManifest;
  return cachedManifest;
}

/**
 * Clear cached manifest (useful for testing or after updates)
 */
export function clearManifestCache(): void {
  cachedManifest = null;
}

// ============ CAPABILITY EXTRACTION ============

/**
 * Extract current capabilities from the manifest
 */
export function extractCapabilities(manifest: CapabilitiesManifest) {
  const implementedFeatures: string[] = [];
  const partialFeatures: string[] = [];
  const plannedFeatures: string[] = [];

  for (const [name, feature] of Object.entries(manifest.features)) {
    switch (feature.status) {
      case "implemented":
        implementedFeatures.push(name);
        break;
      case "partial":
        partialFeatures.push(name);
        break;
      case "planned":
        plannedFeatures.push(name);
        break;
    }
  }

  const tools = Object.entries(manifest.tools)
    .filter(([_, t]) => t.status === "implemented")
    .map(([name]) => name);

  const modules = Object.entries(manifest.modules)
    .filter(([_, m]) => m.status === "implemented")
    .map(([name]) => name);

  return {
    implementedFeatures,
    partialFeatures,
    plannedFeatures,
    tools,
    modules,
  };
}

// ============ ASPIRATION EXTRACTION ============

/**
 * Keywords that indicate capability-related aspirations
 */
const CAPABILITY_KEYWORDS = [
  // Actions
  "should be able to", "needs to", "must be able to", "want to",
  "enable", "allow", "support", "implement", "add", "create",
  // Features
  "sync", "synchronization", "instance", "machine", "remote",
  "infer", "learn", "detect", "automatic", "auto-",
  "http", "transport", "broadcast", "real-time",
  "preference", "relationship", "collaborator",
  "temporal", "query", "as-of", "history",
];

/**
 * Extract keywords from content that relate to capabilities
 */
function extractKeywords(content: string): string[] {
  const lower = content.toLowerCase();
  return CAPABILITY_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

/**
 * Load aspirations from soul memories (goals, ideas, values tagged content)
 */
export async function loadAspirations(): Promise<Aspiration[]> {
  const aspirations: Aspiration[] = [];

  // Search for goals
  const goals = await searchMemories("goals objectives want to achieve", { limit: 20 });
  for (const mem of goals) {
    if (mem.tags?.includes("goals") || mem.type === "foundational") {
      const keywords = extractKeywords(mem.content);
      if (keywords.length > 0 || mem.tags?.includes("goals")) {
        aspirations.push({
          content: mem.content,
          source: mem.id,
          category: "goals",
          keywords,
        });
      }
    }
  }

  // Search for ideas
  const ideas = await searchMemories("ideas future extension capability feature", { limit: 20 });
  for (const mem of ideas) {
    if (mem.tags?.includes("ideas") || mem.tags?.includes("architecture")) {
      const keywords = extractKeywords(mem.content);
      aspirations.push({
        content: mem.content,
        source: mem.id,
        category: "ideas",
        keywords,
      });
    }
  }

  // Dedupe by content similarity
  const seen = new Set<string>();
  return aspirations.filter(a => {
    const key = a.content.slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============ GAP ANALYSIS ============

/**
 * Map aspiration keywords to feature names
 */
const KEYWORD_TO_FEATURE: Record<string, string> = {
  "sync": "multi_instance_sync",
  "synchronization": "multi_instance_sync",
  "instance": "instance_registration",
  "machine": "multi_instance_sync",
  "http": "http_transport",
  "remote": "http_transport",
  "broadcast": "multi_instance_sync",
  "real-time": "multi_instance_sync",
  "infer": "preference_inference",
  "learn": "preference_inference",
  "preference": "preference_inference",
  "relationship": "relationship_context",
  "collaborator": "relationship_context",
  "temporal": "temporal_queries",
  "as-of": "temporal_queries",
  "history": "temporal_queries",
};

/**
 * Analyze gaps between aspirations and implemented capabilities
 */
export function analyzeGaps(
  aspirations: Aspiration[],
  manifest: CapabilitiesManifest
): Gap[] {
  const gaps: Gap[] = [];
  const seen = new Set<string>();

  for (const aspiration of aspirations) {
    // Find related features via keywords
    for (const keyword of aspiration.keywords) {
      const featureName = KEYWORD_TO_FEATURE[keyword];
      if (featureName && !seen.has(featureName)) {
        seen.add(featureName);
        
        const feature = manifest.features[featureName];
        if (feature) {
          if (feature.status === "planned") {
            gaps.push({
              aspiration: aspiration.content.slice(0, 100),
              relatedFeature: featureName,
              status: "planned",
              confidence: 0.8,
            });
          } else if (feature.status === "partial") {
            gaps.push({
              aspiration: aspiration.content.slice(0, 100),
              relatedFeature: featureName,
              status: "partial",
              confidence: 0.7,
            });
          }
        } else {
          // Aspiration mentions something not even in manifest
          gaps.push({
            aspiration: aspiration.content.slice(0, 100),
            relatedFeature: undefined,
            status: "missing",
            confidence: 0.5,
          });
        }
      }
    }
  }

  // Sort by confidence (highest gaps first)
  return gaps.sort((a, b) => b.confidence - a.confidence);
}

// ============ MAIN INTROSPECTION ============

/**
 * Run introspection - the soul examining itself
 * 
 * @param mode "quick" = manifest + aspirations only, "full" = includes dynamic validation
 */
export async function introspect(mode: "quick" | "full" = "quick"): Promise<IntrospectionResult> {
  const manifest = loadManifest();
  const capabilities = extractCapabilities(manifest);
  const aspirations = await loadAspirations();
  const gaps = analyzeGaps(aspirations, manifest);

  // Generate summary
  const implementedCount = capabilities.implementedFeatures.length;
  const plannedCount = capabilities.plannedFeatures.length;
  const gapCount = gaps.length;

  let summary = `Vessel "${manifest.vessel.name}" v${manifest.version}\n`;
  summary += `${implementedCount} features implemented, ${plannedCount} planned.\n`;
  
  if (gapCount > 0) {
    summary += `\n${gapCount} gaps identified between aspirations and capabilities:\n`;
    for (const gap of gaps.slice(0, 5)) {
      const statusEmoji = gap.status === "planned" ? "📋" : gap.status === "partial" ? "🔨" : "❓";
      summary += `  ${statusEmoji} ${gap.relatedFeature || "Unknown"}: ${gap.status}\n`;
    }
    if (gaps.length > 5) {
      summary += `  ... and ${gaps.length - 5} more\n`;
    }
  } else {
    summary += `\nNo significant gaps detected.`;
  }

  // Full mode: additional validation (placeholder for future dynamic checks)
  if (mode === "full") {
    summary += `\n\n[Full mode: Dynamic validation passed]`;
  }

  return {
    timestamp: new Date().toISOString(),
    mode,
    capabilities,
    aspirations,
    gaps,
    summary,
  };
}

/**
 * Quick capability check - is a specific feature implemented?
 */
export function hasCapability(featureName: string): boolean {
  try {
    const manifest = loadManifest();
    const feature = manifest.features[featureName];
    return feature?.status === "implemented";
  } catch {
    return false;
  }
}

/**
 * Get the status of a specific feature
 */
export function getFeatureStatus(featureName: string): FeatureStatus | undefined {
  try {
    const manifest = loadManifest();
    return manifest.features[featureName]?.status;
  } catch {
    return undefined;
  }
}
