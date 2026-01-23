import type { MemoryType } from "./types.js";
import { DEFAULT_TAGS } from "./types.js";

/**
 * Auto-detect memory type from content
 */
export function detectMemoryType(content: string): MemoryType {
  const lower = content.toLowerCase();

  // Decision indicators
  if (
    /\b(decided|chosen|went with|using|will use|approach|strategy)\b/.test(lower) ||
    /\b(because|reason|trade-?off|pros?\/cons?)\b/.test(lower)
  ) {
    return "decision";
  }

  // Pattern indicators
  if (
    /\b(pattern|convention|always|never|standard|best practice)\b/.test(lower) ||
    /\b(naming|structure|organize|folder|file)\b/.test(lower)
  ) {
    return "pattern";
  }

  // Learning indicators
  if (
    /\b(learned|discovered|gotcha|caveat|watch out|bug|issue|problem)\b/.test(lower) ||
    /\b(turns out|realized|found out|actually)\b/.test(lower)
  ) {
    return "learning";
  }

  // Todo indicators
  if (
    /\b(todo|to-do|later|eventually|should|could|might|idea)\b/.test(lower) ||
    /\b(follow-?up|next|future|revisit)\b/.test(lower)
  ) {
    return "todo";
  }

  // Reference indicators
  if (
    /\b(http|url|link|docs?|documentation|reference|see|check out)\b/.test(lower) ||
    /\bhttps?:\/\//.test(lower)
  ) {
    return "reference";
  }

  // Preference indicators
  if (
    /\b(prefer|like|want|style|my way|always use)\b/.test(lower) ||
    /\b(config|setting|option)\b/.test(lower)
  ) {
    return "preference";
  }

  // Default to context
  return "context";
}

/**
 * Auto-detect relevant tags from content
 */
export function detectTags(content: string): string[] {
  const lower = content.toLowerCase();
  const detected: string[] = [];

  const tagPatterns: Record<string, RegExp[]> = {
    architecture: [
      /\b(architecture|design|structure|system|component|module|layer)\b/,
      /\b(microservice|monolith|serverless|event-driven)\b/,
    ],
    api: [
      /\b(api|endpoint|rest|graphql|grpc|http|request|response)\b/,
      /\b(route|handler|controller|middleware)\b/,
    ],
    database: [
      /\b(database|db|sql|query|table|schema|migration)\b/,
      /\b(postgres|mysql|mongo|redis|sqlite)\b/,
    ],
    auth: [
      /\b(auth|authentication|authorization|login|session|token|jwt|oauth)\b/,
      /\b(password|credential|permission|role|access)\b/,
    ],
    performance: [
      /\b(performance|speed|fast|slow|optimize|cache|memory|cpu)\b/,
      /\b(latency|throughput|bottleneck|profile)\b/,
    ],
    security: [
      /\b(security|secure|vulnerability|xss|csrf|injection|sanitize)\b/,
      /\b(encrypt|hash|salt|secret|key)\b/,
    ],
    testing: [
      /\b(test|testing|spec|unit|integration|e2e|mock|stub)\b/,
      /\b(jest|mocha|vitest|pytest|coverage)\b/,
    ],
    deployment: [
      /\b(deploy|deployment|ci\/cd|pipeline|docker|kubernetes|k8s)\b/,
      /\b(aws|gcp|azure|vercel|netlify|heroku)\b/,
    ],
    refactor: [
      /\b(refactor|cleanup|improve|simplify|extract|rename)\b/,
      /\b(technical debt|code smell|dry|solid)\b/,
    ],
    bugfix: [
      /\b(bug|fix|issue|error|crash|broken|wrong|fail)\b/,
      /\b(debug|trace|stack|exception)\b/,
    ],
    feature: [
      /\b(feature|add|implement|create|build|new)\b/,
      /\b(functionality|capability|support)\b/,
    ],
    config: [
      /\b(config|configuration|setting|option|env|environment)\b/,
      /\b(\.env|yaml|json|toml)\b/,
    ],
    documentation: [
      /\b(doc|documentation|readme|comment|jsdoc|typedoc)\b/,
      /\b(explain|describe|document)\b/,
    ],
    dependencies: [
      /\b(dependency|package|library|module|npm|yarn|pip)\b/,
      /\b(install|upgrade|version|lock)\b/,
    ],
  };

  for (const [tag, patterns] of Object.entries(tagPatterns)) {
    if (patterns.some((p) => p.test(lower))) {
      detected.push(tag);
    }
  }

  // Limit to most relevant (max 5)
  return detected.slice(0, 5);
}

/**
 * Estimate importance based on content signals
 */
export function estimateImportance(content: string): number {
  const lower = content.toLowerCase();
  let score = 3; // Default

  // High importance signals
  const highImportance = [
    /\b(critical|important|crucial|essential|must|always|never)\b/,
    /\b(decision|architecture|breaking change|security)\b/,
    /\b(remember|don't forget|key|fundamental)\b/,
  ];

  // Low importance signals
  const lowImportance = [
    /\b(minor|small|trivial|maybe|might|could)\b/,
    /\b(temporary|workaround|hack|quick fix)\b/,
    /\b(fyi|note|btw|side note)\b/,
  ];

  for (const pattern of highImportance) {
    if (pattern.test(lower)) score += 0.5;
  }

  for (const pattern of lowImportance) {
    if (pattern.test(lower)) score -= 0.5;
  }

  // Clamp between 1 and 5
  return Math.max(1, Math.min(5, Math.round(score)));
}

/**
 * Generate a summary of multiple memories (for session summaries)
 */
export function generateSessionSummary(memories: { content: string; type: string }[]): string {
  if (memories.length === 0) return "Empty session.";

  const byType: Record<string, string[]> = {};

  for (const m of memories) {
    if (!byType[m.type]) byType[m.type] = [];
    // Take first ~100 chars of each
    byType[m.type].push(m.content.slice(0, 100) + (m.content.length > 100 ? "..." : ""));
  }

  const parts: string[] = [];

  if (byType.decision?.length) {
    parts.push(`Decisions (${byType.decision.length}): ${byType.decision.slice(0, 2).join("; ")}`);
  }
  if (byType.learning?.length) {
    parts.push(`Learnings (${byType.learning.length}): ${byType.learning.slice(0, 2).join("; ")}`);
  }
  if (byType.pattern?.length) {
    parts.push(`Patterns (${byType.pattern.length}): ${byType.pattern.slice(0, 2).join("; ")}`);
  }
  if (byType.todo?.length) {
    parts.push(`TODOs (${byType.todo.length}): ${byType.todo.slice(0, 2).join("; ")}`);
  }

  // Add others
  const otherTypes = Object.keys(byType).filter(
    (t) => !["decision", "learning", "pattern", "todo"].includes(t)
  );
  if (otherTypes.length) {
    const otherCount = otherTypes.reduce((sum, t) => sum + byType[t].length, 0);
    parts.push(`Other memories: ${otherCount}`);
  }

  return parts.join("\n") || `Session with ${memories.length} memories.`;
}

/**
 * Extract keywords for hybrid search
 */
export function extractKeywords(content: string): string[] {
  // Remove common words and punctuation
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
    "from", "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "then", "once", "here",
    "there", "when", "where", "why", "how", "all", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
    "because", "until", "while", "this", "that", "these", "those", "i", "we",
    "you", "it", "they", "what", "which", "who", "whom", "whose",
  ]);

  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Deduplicate and return top keywords
  return [...new Set(words)].slice(0, 20);
}
