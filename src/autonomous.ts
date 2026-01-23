/**
 * Autonomous Soul Operations
 *
 * This module provides pattern detection for implicit memory triggers
 * and autonomous synthesis/assimilation operations.
 */

import type { MemoryType } from "./types.js";

// ============ IMPLICIT TRIGGER PATTERNS ============

export interface TriggerMatch {
  type: "save" | "recall" | "synthesize" | "align";
  memoryType?: MemoryType;
  confidence: number; // 0-1
  extractedContent?: string;
  suggestedTags?: string[];
}

/**
 * Detect if a message contains implicit save triggers
 */
export function detectSaveTrigger(message: string): TriggerMatch | null {
  const lower = message.toLowerCase();

  // Decision triggers (high confidence)
  const decisionPatterns = [
    /(?:we|i)(?:'ve)? decided (?:to |that )?(.+)/i,
    /(?:the |our )?decision(?: is)? to (.+)/i,
    /(?:we|i) (?:chose|picked|selected|went with) (.+)/i,
    /(?:after (?:considering|thinking|discussing)),? (?:we|i) (?:will |should )?(.+)/i,
    /(?:the |our )?approach (?:is|will be) to (.+)/i,
  ];

  for (const pattern of decisionPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "decision",
        confidence: 0.85,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  // Learning triggers
  const learningPatterns = [
    /(?:i |we )?(?:learned|discovered|found out|realized) (?:that )?(.+)/i,
    /(?:turns out|it appears|apparently),? (.+)/i,
    /(?:the |a )?(?:gotcha|caveat|catch|trick) (?:is|here is) (.+)/i,
    /(?:important|note):? (.+) (?:doesn't|won't|can't) (.+)/i,
    /(?:bug|issue|problem):? (.+)/i,
  ];

  for (const pattern of learningPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "learning",
        confidence: 0.8,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  // Pattern/convention triggers
  const patternPatterns = [
    /(?:going forward|from now on|always|never),? (?:we |i )?(?:should |will |must )?(.+)/i,
    /(?:the |our )?(?:convention|standard|rule|pattern) (?:is|should be) (.+)/i,
    /(?:we |i )?(?:always|never) (.+)/i,
    /(?:best practice):? (.+)/i,
  ];

  for (const pattern of patternPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "pattern",
        confidence: 0.8,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  // Todo triggers
  const todoPatterns = [
    /(?:todo|to-do|later|eventually):? (.+)/i,
    /(?:we |i )?(?:should|need to|must|have to) (?:eventually |later )?(.+)/i,
    /(?:note for (?:later|future)):? (.+)/i,
    /(?:don't forget|remember) to (.+)/i,
    /(?:follow-?up|next steps?):? (.+)/i,
  ];

  for (const pattern of todoPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "todo",
        confidence: 0.75,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  // Preference triggers
  const preferencePatterns = [
    /(?:i |we )?prefer (?:to |using )?(.+)/i,
    /(?:i |we )?(?:like|want) (?:to |it when )(.+)/i,
    /(?:my|our) (?:preference|style) is (.+)/i,
  ];

  for (const pattern of preferencePatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "preference",
        confidence: 0.7,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  // Context triggers (explicit "remember" with context)
  const contextPatterns = [
    /(?:for context|background|fyi):? (.+)/i,
    /(?:the |our )?(?:requirement|constraint|goal) is (.+)/i,
    /(?:this project|this app|this system) (?:is|does|has) (.+)/i,
  ];

  for (const pattern of contextPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "save",
        memoryType: "context",
        confidence: 0.7,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(message),
      };
    }
  }

  return null;
}

/**
 * Detect if a message contains implicit recall triggers
 */
export function detectRecallTrigger(message: string): TriggerMatch | null {
  const lower = message.toLowerCase();

  const recallPatterns = [
    /what (?:did we|was our|were the) (?:decide|decision|choice|approach)/i,
    /(?:what|how) (?:do|did) (?:we|i) (?:handle|do|approach) (.+)/i,
    /(?:remind me|what was|what's) (?:the|our) (.+)/i,
    /(?:have we|did we) (?:ever|already) (.+)/i,
    /(?:what do (?:we|i) know about) (.+)/i,
    /(?:any (?:context|background|history) on) (.+)/i,
  ];

  for (const pattern of recallPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "recall",
        confidence: 0.8,
        extractedContent: match[1] || match[0],
      };
    }
  }

  return null;
}

/**
 * Detect if a message requests synthesis
 */
export function detectSynthesisTrigger(message: string): TriggerMatch | null {
  const lower = message.toLowerCase();

  const synthesisPatterns = [
    /synthesize (?:this |the )?(?:session|conversation|discussion)/i,
    /(?:summarize|wrap up|capture) (?:what we|the key|the important)/i,
    /(?:extract|save) (?:the )?(?:key points|insights|learnings)/i,
    /(?:what should (?:we|i) remember from this)/i,
    /(?:distill|consolidate) (?:this|the) (?:session|conversation)/i,
  ];

  for (const pattern of synthesisPatterns) {
    if (pattern.test(message)) {
      return {
        type: "synthesize",
        confidence: 0.9,
      };
    }
  }

  return null;
}

/**
 * Detect if a message requests alignment (context priming)
 */
export function detectAlignTrigger(message: string): TriggerMatch | null {
  const lower = message.toLowerCase();

  const alignPatterns = [
    /(?:align|prime|load) (?:with |on |for )?(?:context (?:on|about|for) )?(.+)/i,
    /(?:let's (?:continue|resume|work on)) (.+)/i,
    /(?:picking up|continuing) (?:where we left off|from last time)/i,
    /(?:back to|returning to) (.+)/i,
    /(?:context for|working on|starting) (.+)/i,
  ];

  for (const pattern of alignPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        type: "align",
        confidence: 0.75,
        extractedContent: match[1] || match[0],
      };
    }
  }

  return null;
}

/**
 * Master trigger detection - checks all types
 */
export function detectTrigger(message: string): TriggerMatch | null {
  // Check in order of specificity
  const synthesis = detectSynthesisTrigger(message);
  if (synthesis && synthesis.confidence >= 0.8) return synthesis;

  const align = detectAlignTrigger(message);
  if (align && align.confidence >= 0.8) return align;

  const recall = detectRecallTrigger(message);
  if (recall && recall.confidence >= 0.7) return recall;

  const save = detectSaveTrigger(message);
  if (save && save.confidence >= 0.7) return save;

  return null;
}

/**
 * Helper: detect tags from content
 */
function detectTagsFromContent(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];

  const tagKeywords: Record<string, string[]> = {
    architecture: ["architecture", "design", "structure", "system", "component"],
    api: ["api", "endpoint", "rest", "graphql", "http", "request"],
    database: ["database", "db", "sql", "query", "table", "schema", "postgres", "mongo"],
    auth: ["auth", "login", "session", "token", "jwt", "password", "permission"],
    performance: ["performance", "speed", "fast", "slow", "optimize", "cache"],
    security: ["security", "secure", "vulnerability", "xss", "csrf", "sanitize"],
    testing: ["test", "spec", "unit", "integration", "mock", "jest", "coverage"],
    deployment: ["deploy", "ci", "cd", "docker", "kubernetes", "aws", "cloud"],
  };

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some((k) => lower.includes(k))) {
      tags.push(tag);
    }
  }

  return tags.slice(0, 5);
}

// ============ SYNTHESIS OPERATIONS ============

export interface ConversationPoint {
  type: MemoryType;
  content: string;
  importance: number;
  tags: string[];
}

/**
 * Extract memorable points from a conversation/text block
 */
export function extractMemorablePoints(text: string): ConversationPoint[] {
  const points: ConversationPoint[] = [];

  // Split into sentences/statements
  const statements = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  for (const statement of statements) {
    const trigger = detectSaveTrigger(statement);
    if (trigger && trigger.confidence >= 0.7) {
      points.push({
        type: trigger.memoryType || "context",
        content: statement,
        importance: Math.round(trigger.confidence * 5),
        tags: trigger.suggestedTags || [],
      });
    }
  }

  // Deduplicate similar points
  const unique: ConversationPoint[] = [];
  for (const point of points) {
    const isDuplicate = unique.some(
      (p) => similarity(p.content, point.content) > 0.8
    );
    if (!isDuplicate) {
      unique.push(point);
    }
  }

  return unique;
}

/**
 * Simple string similarity (Jaccard on words)
 */
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

// ============ ALIGNMENT REPORT ============

export interface AlignmentReport {
  topic: string;
  relevantMemories: number;
  decisions: string[];
  patterns: string[];
  learnings: string[];
  todos: string[];
  context: string[];
}

/**
 * Generate an alignment report structure (to be filled by actual recall)
 */
export function createAlignmentReportTemplate(topic: string): AlignmentReport {
  return {
    topic,
    relevantMemories: 0,
    decisions: [],
    patterns: [],
    learnings: [],
    todos: [],
    context: [],
  };
}

// ============ BI-DIRECTIONAL DETECTION (Claude's Responses) ============

/**
 * Detect memorable insights from Claude's own responses
 * This enables the soul to learn from what Claude discovers/recommends
 */
export function detectClaudeInsights(response: string): TriggerMatch[] {
  const insights: TriggerMatch[] = [];

  // Recommendation patterns (Claude suggesting something)
  const recommendationPatterns = [
    /(?:i )?recommend (?:using |that you |we )?(.+)/gi,
    /(?:you |we )?should (?:consider |use |implement )(.+)/gi,
    /(?:the )?best (?:approach|practice|way) (?:is|would be) (.+)/gi,
    /(?:i )?suggest (?:using |that |we )?(.+)/gi,
  ];

  for (const pattern of recommendationPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      insights.push({
        type: "save",
        memoryType: "decision",
        confidence: 0.75,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(match[0]),
      });
    }
  }

  // Discovery patterns (Claude finding something)
  const discoveryPatterns = [
    /(?:i )?(?:found|discovered|noticed) (?:that )?(.+)/gi,
    /(?:it )?(?:appears|seems|looks like) (?:that )?(.+)/gi,
    /(?:the )?(?:issue|problem|bug) (?:is|was) (.+)/gi,
    /(?:this )?(?:is caused by|happens because) (.+)/gi,
  ];

  for (const pattern of discoveryPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      insights.push({
        type: "save",
        memoryType: "learning",
        confidence: 0.7,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(match[0]),
      });
    }
  }

  // Pattern identification (Claude identifying a pattern)
  const patternIdentificationPatterns = [
    /(?:the )?(?:pattern|convention|standard) (?:here |used )?is (.+)/gi,
    /(?:this )?(?:codebase|project) (?:uses|follows) (.+)/gi,
    /(?:i )?(?:see|notice) (?:a pattern|that) (.+)/gi,
  ];

  for (const pattern of patternIdentificationPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      insights.push({
        type: "save",
        memoryType: "pattern",
        confidence: 0.7,
        extractedContent: match[0],
        suggestedTags: detectTagsFromContent(match[0]),
      });
    }
  }

  // Solution patterns (Claude solving something)
  const solutionPatterns = [
    /(?:the )?(?:solution|fix|answer) (?:is|was) (.+)/gi,
    /(?:to )?(?:fix|solve|resolve) this,? (?:you |we )?(?:need to |should |can )(.+)/gi,
    /(?:this )?(?:can be fixed|is resolved) by (.+)/gi,
  ];

  for (const pattern of solutionPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      insights.push({
        type: "save",
        memoryType: "learning",
        confidence: 0.8,
        extractedContent: match[0],
        suggestedTags: [...detectTagsFromContent(match[0]), "bugfix"],
      });
    }
  }

  // Deduplicate similar insights
  const unique: TriggerMatch[] = [];
  for (const insight of insights) {
    const isDuplicate = unique.some(
      (u) =>
        u.extractedContent &&
        insight.extractedContent &&
        similarity(u.extractedContent, insight.extractedContent) > 0.7
    );
    if (!isDuplicate) {
      unique.push(insight);
    }
  }

  return unique;
}

/**
 * Semantic threshold crossing detection
 * Detects when content crosses importance thresholds
 */
export interface SemanticSignal {
  signal: "critical" | "important" | "notable" | "routine";
  reason: string;
  boost: number; // Importance boost
}

export function detectSemanticSignal(content: string): SemanticSignal {
  const lower = content.toLowerCase();

  // Critical signals - architecture, security, breaking changes
  const criticalPatterns = [
    /\b(breaking change|security|vulnerability|critical|architecture decision)\b/,
    /\b(never|always|must|required|mandatory)\b.*\b(security|auth|database|api)\b/,
    /\b(migration|schema change|database change)\b/,
  ];

  for (const pattern of criticalPatterns) {
    if (pattern.test(lower)) {
      return {
        signal: "critical",
        reason: "Security, architecture, or breaking change detected",
        boost: 2,
      };
    }
  }

  // Important signals - decisions, patterns
  const importantPatterns = [
    /\b(decided|chosen|selected|approach|strategy)\b/,
    /\b(because|reason|trade-?off|pros?\/cons?)\b/,
    /\b(convention|standard|pattern|rule)\b/,
  ];

  for (const pattern of importantPatterns) {
    if (pattern.test(lower)) {
      return {
        signal: "important",
        reason: "Decision or pattern with reasoning",
        boost: 1,
      };
    }
  }

  // Notable signals - learnings, discoveries
  const notablePatterns = [
    /\b(learned|discovered|found out|realized|gotcha)\b/,
    /\b(bug|issue|problem|error|fix)\b/,
    /\b(works|doesn't work|solution)\b/,
  ];

  for (const pattern of notablePatterns) {
    if (pattern.test(lower)) {
      return {
        signal: "notable",
        reason: "Learning or discovery",
        boost: 0.5,
      };
    }
  }

  return {
    signal: "routine",
    reason: "Standard content",
    boost: 0,
  };
}

/**
 * Combined analysis: user message + Claude response
 */
export interface ConversationAnalysis {
  userTrigger: TriggerMatch | null;
  claudeInsights: TriggerMatch[];
  semanticSignal: SemanticSignal;
  shouldAutoSave: boolean;
  totalMemorableItems: number;
}

export function analyzeConversationTurn(
  userMessage: string,
  claudeResponse: string
): ConversationAnalysis {
  const userTrigger = detectTrigger(userMessage);
  const claudeInsights = detectClaudeInsights(claudeResponse);
  const semanticSignal = detectSemanticSignal(userMessage + " " + claudeResponse);

  const shouldAutoSave =
    (userTrigger?.confidence ?? 0) >= 0.7 ||
    claudeInsights.some((i) => i.confidence >= 0.75) ||
    semanticSignal.signal === "critical" ||
    semanticSignal.signal === "important";

  return {
    userTrigger,
    claudeInsights,
    semanticSignal,
    shouldAutoSave,
    totalMemorableItems:
      (userTrigger ? 1 : 0) + claudeInsights.length,
  };
}
