/**
 * Dream State Module
 * 
 * Implements the "sleep" phase of the soul architecture - batch processing
 * that reorganizes, consolidates, and maintains memory health during offline periods.
 * 
 * Designed to be triggered by CI/CD pipelines (GitHub Actions) on a schedule.
 */

import { Memory, DreamOperation, DreamReport, FoundationalCategory, FoundationalMemory } from "./types.js";

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
      confidence: 0.7,
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
          confidence: 0.85,
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
          confidence: 0.85,
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
}

/**
 * Find memories that could be consolidated into one
 */
export function findConsolidationCandidates(
  memories: Memory[],
  similarityThreshold: number = 0.85
): ConsolidationCandidate[] {
  // This would use embeddings in real implementation
  // For now, use content similarity heuristics
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
      candidates.push({
        memories: cluster,
        similarity: cluster.length > 1 ? similarityThreshold : 1,
        suggestedMerge: suggestMergedContent(cluster),
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

function suggestMergedContent(memories: Memory[]): string {
  // Take the longest, most detailed memory as base
  const sorted = [...memories].sort((a, b) => b.content.length - a.content.length);
  return sorted[0].content;
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
  const accessBoost = Math.min(memory.access_count * 0.1, 1);
  const withBoost = decayed + accessBoost;
  
  // Clamp to valid range
  return Math.max(config.minImportance, Math.min(5, withBoost));
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
      config.consolidationThreshold ?? 0.85
    );
    report.consolidations = candidates.length;
  }
  
  if (config.operations.includes("decay")) {
    let decayedCount = 0;
    for (const memory of memories) {
      const newImportance = calculateDecay(memory, config.decayConfig);
      if (Math.abs(newImportance - memory.importance) > 0.1) {
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
 */
export async function runDreamCycleWithMutations(
  memories: Memory[],
  config: DreamConfig,
  db: DreamDbOperations
): Promise<DreamReport> {
  // First do dry-run analysis
  const report = runDreamCycle(memories, { ...config, dryRun: true });
  
  if (config.dryRun) {
    return report;
  }
  
  // Apply decay mutations
  if (config.operations.includes("decay")) {
    for (const memory of memories) {
      if (config.decayConfig?.exemptTypes?.includes(memory.type)) continue;
      
      const newImportance = calculateDecay(memory, config.decayConfig);
      if (Math.abs(newImportance - memory.importance) > 0.1) {
        await db.updateMemory(memory.id, { 
          importance: Math.round(newImportance * 10) / 10 
        });
      }
    }
  }
  
  // Apply contradiction resolution
  if (config.operations.includes("contradiction") && report.contradictions_found.length > 0) {
    for (const conflict of report.contradictions_found) {
      if (conflict.conflict_type === "temporal") {
        // Newer supersedes older - find which is which
        const memA = memories.find(m => m.id === conflict.memory_a);
        const memB = memories.find(m => m.id === conflict.memory_b);
        if (memA && memB) {
          const aTime = new Date(memA.timestamp).getTime();
          const bTime = new Date(memB.timestamp).getTime();
          
          if (aTime > bTime) {
            await db.supersedeMemory(memB.id, memA.id);
          } else {
            await db.supersedeMemory(memA.id, memB.id);
          }
        }
      }
      // Direct contradictions are flagged but not auto-resolved
    }
  }
  
  // Apply consolidation (merge similar memories)
  if (config.operations.includes("consolidate")) {
    const candidates = findConsolidationCandidates(
      memories, 
      config.consolidationThreshold ?? 0.85
    );
    
    for (const candidate of candidates) {
      if (candidate.memories.length < 2) continue;
      
      // Keep the most important/recent, merge content
      const sorted = [...candidate.memories].sort((a, b) => {
        // Priority: importance, then recency
        if (b.importance !== a.importance) return b.importance - a.importance;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      const keeper = sorted[0];
      const toMerge = sorted.slice(1);
      
      // Create consolidated memory
      const consolidatedId = await db.saveMemory({
        content: candidate.suggestedMerge,
        type: keeper.type,
        tags: [...new Set(candidate.memories.flatMap(m => m.tags))],
        timestamp: new Date().toISOString(),
        importance: Math.max(...candidate.memories.map(m => m.importance)),
        source: "consolidated",
        layer: keeper.layer,
        valid_from: new Date().toISOString(),
        metadata: {
          consolidated_from: candidate.memories.map(m => m.id),
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
      if (conflict && conflict.confidence > 0.6) {
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
};
