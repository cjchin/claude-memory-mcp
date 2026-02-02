/**
 * Dream State Module
 * 
 * Implements the "sleep" phase of the soul architecture - batch processing
 * that reorganizes, consolidates, and maintains memory health during offline periods.
 * 
 * Supports two modes:
 * - Heuristic: Fast, rule-based processing (default)
 * - LLM-assisted: Uses configured LLM for judgment (when dream_use_llm=true)
 * 
 * Designed to be triggered by CI/CD pipelines (GitHub Actions) on a schedule.
 */

import { Memory, DreamOperation, DreamReport, FoundationalCategory, FoundationalMemory } from "./types.js";
import { embed, cosineSimilarity } from "./embeddings.js";
import { config } from "./config.js";
import { 
  getLLMProvider, 
  isLLMAvailable, 
  judgeContradiction, 
  judgeConsolidation,
  type LLMProvider,
  type ContradictionJudgment,
  type ConsolidationJudgment,
} from "./llm.js";

// ============ CONSTANTS ============

const DREAM = {
  // Contradiction detection confidence thresholds
  TEMPORAL_CONFLICT_CONFIDENCE: 0.7,
  DIRECT_CONFLICT_CONFIDENCE: 0.85,
  MIN_CONTRADICTION_CONFIDENCE: 0.6,

  // Consolidation
  DEFAULT_CONSOLIDATION_THRESHOLD: 0.85,
  NOVELTY_THRESHOLD: 0.3,        // Minimum novel word ratio to include a sentence
  DUPLICATE_TEXT_THRESHOLD: 0.7,  // Text similarity above which content is considered duplicate
  MIN_IMPORTANCE_CHANGE: 0.1,    // Minimum change to trigger a decay update

  // Decay
  ACCESS_BOOST_PER_COUNT: 0.1,   // Importance boost per access
  MAX_ACCESS_BOOST: 1,           // Cap on access-based importance boost
  MAX_IMPORTANCE: 5,
} as const;

// Database operations will be injected to avoid circular dependencies
export interface DreamDbOperations {
  updateMemory: (id: string, updates: Partial<Memory>) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  saveMemory: (memory: Omit<Memory, "id" | "access_count">) => Promise<string>;
  supersedeMemory: (oldId: string, newId: string) => Promise<void>;
}

// ============================================================================
// Contradiction Detection
// ============================================================================

export interface ContradictionCandidate {
  memory_a: Memory;
  memory_b: Memory;
  conflict_type: "direct" | "temporal" | "semantic";
  confidence: number;
  explanation: string;
}

/**
 * Detect potential contradictions between two memories
 */
export function detectContradiction(a: Memory, b: Memory): ContradictionCandidate | null {
  // Skip if same memory or both foundational
  if (a.id === b.id) return null;
  if (a.type === "foundational" && b.type === "foundational") return null;
  
  // Temporal contradiction: newer memory about same topic with different conclusion
  if (a.project === b.project && sharesTags(a.tags, b.tags)) {
    const temporalConflict = detectTemporalConflict(a, b);
    if (temporalConflict) return temporalConflict;
  }
  
  // Direct contradiction: explicit negation patterns
  const directConflict = detectDirectConflict(a, b);
  if (directConflict) return directConflict;
  
  return null;
}

function sharesTags(tagsA: string[], tagsB: string[]): boolean {
  return tagsA.some(t => tagsB.includes(t));
}

function detectTemporalConflict(a: Memory, b: Memory): ContradictionCandidate | null {
  // Both must be decisions or patterns
  if (!["decision", "pattern", "preference"].includes(a.type)) return null;
  if (!["decision", "pattern", "preference"].includes(b.type)) return null;
  
  // Check for "changed from X to Y" indicators
  const changePatterns = [
    /\b(switched|changed|moved|migrated)\s+(from|away)/i,
    /\b(no longer|stopped|quit)\s+(using|doing)/i,
    /\bnow\s+(use|prefer|using|do)\b/i,
    /\binstead\s+of\b/i,
  ];
  
  const aIndicatesChange = changePatterns.some(p => p.test(a.content));
  const bIndicatesChange = changePatterns.some(p => p.test(b.content));
  
  if (aIndicatesChange || bIndicatesChange) {
    const newer = new Date(a.timestamp) > new Date(b.timestamp) ? a : b;
    const older = newer === a ? b : a;
    
    return {
      memory_a: older,
      memory_b: newer,
      conflict_type: "temporal",
      confidence: DREAM.TEMPORAL_CONFLICT_CONFIDENCE,
      explanation: `Newer memory (${newer.id}) may supersede older memory (${older.id}) on same topic`,
    };
  }
  
  return null;
}

function detectDirectConflict(a: Memory, b: Memory): ContradictionCandidate | null {
  const negationPairs = [
    [/\buse\s+(\w+)\b/i, /\b(don't|do not|never)\s+use\s+(\w+)\b/i],
    [/\balways\s+(\w+)\b/i, /\bnever\s+(\w+)\b/i],
    [/\bprefer\s+(\w+)\b/i, /\bavoid\s+(\w+)\b/i],
    [/\bis\s+good\b/i, /\bis\s+(bad|poor|terrible)\b/i],
    [/\bworks?\s+well\b/i, /\b(doesn't|does not)\s+work\b/i],
  ];
  
  for (const [patternA, patternB] of negationPairs) {
    const matchA_pos = patternA.exec(a.content);
    const matchB_neg = patternB.exec(b.content);
    
    if (matchA_pos && matchB_neg) {
      // Check if they're talking about the same thing
      const subjectA = matchA_pos[1]?.toLowerCase();
      const subjectB = matchB_neg[matchB_neg.length - 1]?.toLowerCase();
      
      if (subjectA && subjectB && subjectA === subjectB) {
        return {
          memory_a: a,
          memory_b: b,
          conflict_type: "direct",
          confidence: DREAM.DIRECT_CONFLICT_CONFIDENCE,
          explanation: `Direct contradiction about "${subjectA}": one says to use it, another says not to`,
        };
      }
    }
    
    // Check reverse
    const matchA_neg = patternB.exec(a.content);
    const matchB_pos = patternA.exec(b.content);
    
    if (matchA_neg && matchB_pos) {
      const subjectA = matchA_neg[matchA_neg.length - 1]?.toLowerCase();
      const subjectB = matchB_pos[1]?.toLowerCase();
      
      if (subjectA && subjectB && subjectA === subjectB) {
        return {
          memory_a: a,
          memory_b: b,
          conflict_type: "direct",
          confidence: DREAM.DIRECT_CONFLICT_CONFIDENCE,
          explanation: `Direct contradiction about "${subjectA}"`,
        };
      }
    }
  }
  
  return null;
}

// ============================================================================
// Memory Consolidation
// ============================================================================

export interface ConsolidationCandidate {
  memories: Memory[];
  similarity: number;
  suggestedMerge: string;
  mergeRationale: string;
}

/**
 * Memory with pre-computed embedding for consolidation analysis
 */
export interface MemoryWithEmbedding {
  memory: Memory;
  embedding: number[];
}

/**
 * Find memories that could be consolidated into one using SEMANTIC similarity.
 * This version uses embeddings for accurate similarity detection.
 */
export async function findConsolidationCandidatesWithEmbeddings(
  memories: Memory[],
  similarityThreshold: number = DREAM.DEFAULT_CONSOLIDATION_THRESHOLD
): Promise<ConsolidationCandidate[]> {
  if (memories.length < 2) return [];
  
  // Generate embeddings for all memories
  const memoriesWithEmbeddings: MemoryWithEmbedding[] = [];
  for (const memory of memories) {
    const embedding = await embed(memory.content);
    memoriesWithEmbeddings.push({ memory, embedding });
  }
  
  return findConsolidationCandidatesFromEmbeddings(
    memoriesWithEmbeddings,
    similarityThreshold
  );
}

/**
 * Find consolidation candidates from pre-embedded memories (faster for bulk operations)
 */
export function findConsolidationCandidatesFromEmbeddings(
  memoriesWithEmbeddings: MemoryWithEmbedding[],
  similarityThreshold: number = DREAM.DEFAULT_CONSOLIDATION_THRESHOLD
): ConsolidationCandidate[] {
  const candidates: ConsolidationCandidate[] = [];
  const processed = new Set<string>();
  
  for (let i = 0; i < memoriesWithEmbeddings.length; i++) {
    const { memory: memA, embedding: embA } = memoriesWithEmbeddings[i];
    if (processed.has(memA.id)) continue;
    
    const cluster: MemoryWithEmbedding[] = [memoriesWithEmbeddings[i]];
    let totalSimilarity = 0;
    let similarityCount = 0;
    
    for (let j = i + 1; j < memoriesWithEmbeddings.length; j++) {
      const { memory: memB, embedding: embB } = memoriesWithEmbeddings[j];
      if (processed.has(memB.id)) continue;
      
      const similarity = cosineSimilarity(embA, embB);
      
      if (similarity >= similarityThreshold) {
        cluster.push(memoriesWithEmbeddings[j]);
        processed.add(memB.id);
        totalSimilarity += similarity;
        similarityCount++;
      }
    }
    
    if (cluster.length > 1) {
      const avgSimilarity = similarityCount > 0 ? totalSimilarity / similarityCount : similarityThreshold;
      const mergeResult = intelligentMerge(cluster.map(c => c.memory));
      
      candidates.push({
        memories: cluster.map(c => c.memory),
        similarity: avgSimilarity,
        suggestedMerge: mergeResult.content,
        mergeRationale: mergeResult.rationale,
      });
    }
    
    processed.add(memA.id);
  }
  
  return candidates;
}

/**
 * Intelligently merge multiple memories by combining unique information.
 * Instead of just picking the longest, this extracts and synthesizes content.
 */
export function intelligentMerge(memories: Memory[]): { content: string; rationale: string } {
  if (memories.length === 0) {
    return { content: "", rationale: "No memories to merge" };
  }
  if (memories.length === 1) {
    return { content: memories[0].content, rationale: "Single memory, no merge needed" };
  }
  
  // Sort by importance (desc), then by length (desc), then by recency (desc)
  const sorted = [...memories].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (b.content.length !== a.content.length) return b.content.length - a.content.length;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  // Primary memory is the "best" one
  const primary = sorted[0];
  const others = sorted.slice(1);
  
  // Extract unique phrases/sentences from other memories not in primary
  const primarySentences = extractSentences(primary.content);
  const primaryWords = new Set(primary.content.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  
  const uniqueAdditions: string[] = [];
  
  for (const other of others) {
    const otherSentences = extractSentences(other.content);
    
    for (const sentence of otherSentences) {
      // Check if this sentence adds novel information
      const sentenceWords = new Set(sentence.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      const overlap = [...sentenceWords].filter(w => primaryWords.has(w)).length;
      const novelty = 1 - (overlap / Math.max(sentenceWords.size, 1));
      
      // If sentence has significant novel content (>30% new words)
      if (novelty > DREAM.NOVELTY_THRESHOLD && sentence.length > 10) {
        // Check it's not already added
        const isDuplicate = uniqueAdditions.some(existing => 
          computeTextSimilarity(existing, sentence) > DREAM.DUPLICATE_TEXT_THRESHOLD
        );
        
        if (!isDuplicate) {
          uniqueAdditions.push(sentence.trim());
        }
      }
    }
  }
  
  // Construct merged content
  let mergedContent = primary.content;
  
  if (uniqueAdditions.length > 0) {
    // Add unique info as supplementary
    mergedContent += "\n\n[Additional context: " + uniqueAdditions.join(". ") + "]";
  }
  
  const rationale = uniqueAdditions.length > 0
    ? `Combined ${memories.length} memories. Base: most important/detailed. Added ${uniqueAdditions.length} unique detail(s) from others.`
    : `Kept most important/detailed memory (${memories.length - 1} near-duplicates removed).`;
  
  return { content: mergedContent, rationale };
}

/**
 * Extract sentences from text
 */
function extractSentences(text: string): string[] {
  // Split on sentence boundaries
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

/**
 * Find memories that could be consolidated (sync version using text similarity).
 * Use findConsolidationCandidatesWithEmbeddings for better accuracy.
 */
export function findConsolidationCandidates(
  memories: Memory[],
  similarityThreshold: number = DREAM.DEFAULT_CONSOLIDATION_THRESHOLD
): ConsolidationCandidate[] {
  const candidates: ConsolidationCandidate[] = [];
  const processed = new Set<string>();
  
  for (let i = 0; i < memories.length; i++) {
    if (processed.has(memories[i].id)) continue;
    
    const cluster: Memory[] = [memories[i]];
    
    for (let j = i + 1; j < memories.length; j++) {
      if (processed.has(memories[j].id)) continue;
      
      const similarity = computeTextSimilarity(memories[i].content, memories[j].content);
      
      if (similarity >= similarityThreshold) {
        cluster.push(memories[j]);
        processed.add(memories[j].id);
      }
    }
    
    if (cluster.length > 1) {
      const mergeResult = intelligentMerge(cluster);
      candidates.push({
        memories: cluster,
        similarity: similarityThreshold,
        suggestedMerge: mergeResult.content,
        mergeRationale: mergeResult.rationale,
      });
    }
    
    processed.add(memories[i].id);
  }
  
  return candidates;
}

function computeTextSimilarity(a: string, b: string): number {
  // Jaccard similarity on words
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}

// ============================================================================
// Importance Decay
// ============================================================================

export interface DecayConfig {
  halfLifeDays: number;
  accessBoostDays: number;
  minImportance: number;
  exemptTypes: string[];
}

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  halfLifeDays: 30,
  accessBoostDays: 7,
  minImportance: 1,
  exemptTypes: ["foundational", "contradiction"],
};

// Shadow memories decay faster (half the normal half-life)
const SHADOW_DECAY_CONFIG: DecayConfig = {
  halfLifeDays: 15,  // Faster decay for auto-promoted shadows
  accessBoostDays: 5,
  minImportance: 1,
  exemptTypes: ["foundational", "contradiction"],
};

/**
 * Calculate new importance after decay
 */
export function calculateDecay(
  memory: Memory,
  config: DecayConfig = DEFAULT_DECAY_CONFIG
): number {
  // Foundational memories never decay
  if (config.exemptTypes.includes(memory.type)) {
    return memory.importance;
  }
  
  const now = new Date();
  const created = new Date(memory.timestamp);
  const lastAccess = memory.last_accessed ? new Date(memory.last_accessed) : created;
  
  // Days since creation
  const daysSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  
  // Days since last access (resets decay clock)
  const daysSinceAccess = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24);
  
  // Use the more recent of the two
  const effectiveDays = Math.min(daysSinceCreation, daysSinceAccess + config.accessBoostDays);
  
  // Exponential decay: I(t) = I(0) * 0.5^(t/halfLife)
  const decayFactor = Math.pow(0.5, effectiveDays / config.halfLifeDays);
  const decayed = memory.importance * decayFactor;
  
  // Access count provides resistance to decay
  const accessBoost = Math.min(memory.access_count * DREAM.ACCESS_BOOST_PER_COUNT, DREAM.MAX_ACCESS_BOOST);
  const withBoost = decayed + accessBoost;

  // Clamp to valid range
  return Math.max(config.minImportance, Math.min(DREAM.MAX_IMPORTANCE, withBoost));
}

// ============================================================================
// Foundational Memory Parsing
// ============================================================================

interface ParsedFoundational {
  category: FoundationalCategory;
  content: string;
  tags: string[];
}

/**
 * Parse founding-memories.md format
 */
export function parseFoundingMemories(markdown: string): ParsedFoundational[] {
  const memories: ParsedFoundational[] = [];
  // Normalize line endings (Windows \r\n to \n)
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  
  let currentCategory: FoundationalCategory | null = null;
  
  const categoryMap: Record<string, FoundationalCategory> = {
    "identity": "identity",
    "goals": "goals",
    "values": "values",
    "constraints": "constraints",
    "style": "style",
  };
  
  for (const line of lines) {
    // Check for category headers
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const headerText = headerMatch[1].toLowerCase();
      for (const [key, value] of Object.entries(categoryMap)) {
        if (headerText.includes(key)) {
          currentCategory = value;
          break;
        }
      }
      continue;
    }
    
    // Parse list items as memories
    const itemMatch = line.match(/^[-*]\s+(.+)$/);
    if (itemMatch && currentCategory) {
      const content = itemMatch[1].trim();
      if (content && !content.startsWith("[") && !content.startsWith("Example")) {
        memories.push({
          category: currentCategory,
          content: content,
          tags: [currentCategory, "foundational"],
        });
      }
    }
  }
  
  return memories;
}

/**
 * Create a FoundationalMemory from parsed content
 */
export function createFoundationalMemory(
  parsed: ParsedFoundational,
  project?: string
): FoundationalMemory {
  return {
    id: `found_${parsed.category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: parsed.content,
    type: "foundational",
    layer: "foundational",
    category: parsed.category,
    tags: parsed.tags,
    timestamp: new Date().toISOString(),
    project,
    importance: 5,
    confidence: 1,
    access_count: 0,
    source: "human",
    valid_from: new Date().toISOString(),
  };
}

// ============================================================================
// Dream Orchestration
// ============================================================================

export interface DreamConfig {
  operations: DreamOperation[];
  dryRun: boolean;
  decayConfig?: DecayConfig;
  consolidationThreshold?: number;
  contradictionThreshold?: number;
}

/**
 * Run a dream cycle on a set of memories
 * Returns a report of what was done (or would be done in dry-run mode)
 */
export function runDreamCycle(
  memories: Memory[],
  config: DreamConfig
): DreamReport {
  const report: DreamReport = {
    started_at: new Date().toISOString(),
    completed_at: "",
    operations: config.operations,
    memories_processed: memories.length,
    consolidations: 0,
    contradictions_found: [],
    memories_decayed: 0,
    memories_pruned: 0,
    links_created: 0,
    summaries_created: [],
  };
  
  // Run requested operations
  if (config.operations.includes("contradiction")) {
    const contradictions = findAllContradictions(memories);
    report.contradictions_found = contradictions.map(c => ({
      memory_a: c.memory_a.id,
      memory_b: c.memory_b.id,
      conflict_type: c.conflict_type,
      explanation: c.explanation,
    }));
  }
  
  if (config.operations.includes("consolidate")) {
    const candidates = findConsolidationCandidates(
      memories, 
      config.consolidationThreshold ?? DREAM.DEFAULT_CONSOLIDATION_THRESHOLD
    );
    report.consolidations = candidates.length;
  }
  
  if (config.operations.includes("decay")) {
    let decayedCount = 0;
    for (const memory of memories) {
      const newImportance = calculateDecay(memory, config.decayConfig);
      if (Math.abs(newImportance - memory.importance) > DREAM.MIN_IMPORTANCE_CHANGE) {
        decayedCount++;
      }
    }
    report.memories_decayed = decayedCount;
  }
  
  report.completed_at = new Date().toISOString();
  return report;
}

/**
 * Run a dream cycle with actual database mutations
 * 
 * If config.dream_use_llm is true, uses configured LLM for judgment.
 * Otherwise, uses heuristic-based decisions.
 */
export async function runDreamCycleWithMutations(
  memories: Memory[],
  dreamConfig: DreamConfig,
  db: DreamDbOperations
): Promise<DreamReport> {
  // Check if LLM is configured and available
  const useLLM = config.dream_use_llm && await isLLMAvailable();
  const llmProvider = useLLM ? getLLMProvider() : null;
  
  // First do dry-run analysis
  const report = runDreamCycle(memories, { ...dreamConfig, dryRun: true });
  
  // Track LLM usage in report
  (report as any).llm_assisted = useLLM;
  if (useLLM && llmProvider) {
    (report as any).llm_provider = llmProvider.name;
  }
  
  if (dreamConfig.dryRun) {
    return report;
  }
  
  // Apply decay mutations (no LLM needed - mathematical)
  if (dreamConfig.operations.includes("decay")) {
    for (const memory of memories) {
      if (dreamConfig.decayConfig?.exemptTypes?.includes(memory.type)) continue;

      // Shadow memories decay faster unless they've been accessed frequently
      const decayConfig = memory.type === "shadow"
        ? SHADOW_DECAY_CONFIG
        : dreamConfig.decayConfig;

      const newImportance = calculateDecay(memory, decayConfig);
      if (Math.abs(newImportance - memory.importance) > DREAM.MIN_IMPORTANCE_CHANGE) {
        await db.updateMemory(memory.id, {
          importance: Math.round(newImportance * 10) / 10
        });
      }
    }
  }
  
  // Apply contradiction resolution
  if (dreamConfig.operations.includes("contradiction") && report.contradictions_found.length > 0) {
    for (const conflict of report.contradictions_found) {
      const memA = memories.find(m => m.id === conflict.memory_a);
      const memB = memories.find(m => m.id === conflict.memory_b);
      
      if (!memA || !memB) continue;
      
      if (useLLM) {
        // Use LLM judgment for contradiction resolution
        const judgment = await judgeContradiction(memA, memB, conflict.explanation);
        
        if (judgment.isRealConflict) {
          switch (judgment.resolution) {
            case "supersede_a":
              await db.supersedeMemory(memA.id, memB.id);
              break;
            case "supersede_b":
              await db.supersedeMemory(memB.id, memA.id);
              break;
            case "merge":
              if (judgment.mergedContent) {
                const mergedId = await db.saveMemory({
                  content: judgment.mergedContent,
                  type: memA.type,
                  tags: [...new Set([...memA.tags, ...memB.tags])],
                  timestamp: new Date().toISOString(),
                  importance: Math.max(memA.importance, memB.importance),
                  source: "consolidated",
                  layer: memA.layer,
                  valid_from: new Date().toISOString(),
                  metadata: {
                    llm_merged_from: [memA.id, memB.id],
                    llm_reasoning: judgment.reasoning,
                  },
                });
                await db.supersedeMemory(memA.id, mergedId);
                await db.supersedeMemory(memB.id, mergedId);
              }
              break;
            case "keep_both":
              // No action needed
              break;
          }
        }
      } else {
        // Heuristic fallback: temporal contradictions resolved by recency
        if (conflict.conflict_type === "temporal") {
          const aTime = new Date(memA.timestamp).getTime();
          const bTime = new Date(memB.timestamp).getTime();
          
          if (aTime > bTime) {
            await db.supersedeMemory(memB.id, memA.id);
          } else {
            await db.supersedeMemory(memA.id, memB.id);
          }
        }
        // Direct contradictions are flagged but not auto-resolved without LLM
      }
    }
  }
  
  // Apply consolidation (merge similar memories)
  if (dreamConfig.operations.includes("consolidate")) {
    const candidates = findConsolidationCandidates(
      memories, 
      dreamConfig.consolidationThreshold ?? 0.85
    );
    
    for (const candidate of candidates) {
      if (candidate.memories.length < 2) continue;
      
      let finalContent: string;
      let finalRationale: string;
      
      if (useLLM) {
        // Use LLM to synthesize merged content
        const judgment = await judgeConsolidation(candidate.memories, candidate.suggestedMerge);
        
        if (!judgment.shouldMerge) {
          // LLM says don't merge these
          continue;
        }
        
        finalContent = judgment.mergedContent || candidate.suggestedMerge;
        finalRationale = judgment.reasoning;
      } else {
        // Use heuristic merge
        finalContent = candidate.suggestedMerge;
        finalRationale = candidate.mergeRationale;
      }
      
      // Keep the most important/recent as base
      const sorted = [...candidate.memories].sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      const keeper = sorted[0];
      const toMerge = sorted.slice(1);
      
      // Create consolidated memory
      const consolidatedId = await db.saveMemory({
        content: finalContent,
        type: keeper.type,
        tags: [...new Set(candidate.memories.flatMap(m => m.tags))],
        timestamp: new Date().toISOString(),
        importance: Math.max(...candidate.memories.map(m => m.importance)),
        source: useLLM ? "llm_consolidated" : "consolidated",
        layer: keeper.layer,
        valid_from: new Date().toISOString(),
        metadata: {
          consolidated_from: candidate.memories.map(m => m.id),
          merge_rationale: finalRationale,
          llm_assisted: useLLM,
        },
      });
      
      report.summaries_created.push(consolidatedId);
      
      // Mark merged memories as superseded
      for (const mem of toMerge) {
        await db.supersedeMemory(mem.id, consolidatedId);
      }
    }
  }
  
  report.completed_at = new Date().toISOString();
  return report;
}

function findAllContradictions(memories: Memory[]): ContradictionCandidate[] {
  const contradictions: ContradictionCandidate[] = [];
  
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const conflict = detectContradiction(memories[i], memories[j]);
      if (conflict && conflict.confidence > DREAM.MIN_CONTRADICTION_CONFIDENCE) {
        contradictions.push(conflict);
      }
    }
  }
  
  return contradictions;
}

// ============================================================================
// Export for CLI and CI/CD
// ============================================================================

export {
  DEFAULT_DECAY_CONFIG,
  SHADOW_DECAY_CONFIG,
  computeTextSimilarity,
};
