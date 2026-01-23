/**
 * Smart Alignment System
 * 
 * Provides intelligent, bidirectional memory alignment between user and Claude.
 * Detects implicit triggers from both sides and enables automatic memory 
 * management without explicit commands.
 */

import type { MemoryType } from './types.js';
import { 
  detectTrigger, 
  detectClaudeInsights, 
  detectSemanticSignal,
  analyzeConversationTurn,
  type TriggerMatch,
  type SemanticSignal,
  type ConversationAnalysis,
} from './autonomous.js';
import { detectMemoryType, detectTags, estimateImportance } from './intelligence.js';

// ============ ALIGNMENT CONFIGURATION ============

export interface AlignmentConfig {
  /** Minimum confidence to auto-save user triggers */
  userTriggerThreshold: number;
  /** Minimum confidence to auto-save Claude insights */
  claudeInsightThreshold: number;
  /** Enable automatic memory creation */
  autoSaveEnabled: boolean;
  /** Semantic signals that trigger auto-save */
  autoSaveSignals: SemanticSignal['signal'][];
  /** Memory types that are always saved automatically */
  alwaysSaveTypes: MemoryType[];
  /** Maximum memories to create per conversation turn */
  maxMemoriesPerTurn: number;
  /** Dedupe threshold (0-1, higher = stricter) */
  dedupeThreshold: number;
}

export const DEFAULT_ALIGNMENT_CONFIG: AlignmentConfig = {
  userTriggerThreshold: 0.7,
  claudeInsightThreshold: 0.75,
  autoSaveEnabled: true,
  autoSaveSignals: ['critical', 'important'],
  alwaysSaveTypes: ['decision', 'pattern'],
  maxMemoriesPerTurn: 5,
  dedupeThreshold: 0.8,
};

// ============ MEMORY CANDIDATE ============

export interface MemoryCandidate {
  content: string;
  type: MemoryType;
  tags: string[];
  importance: number;
  source: 'user' | 'claude' | 'synthesis';
  confidence: number;
  trigger: 'explicit' | 'implicit' | 'semantic';
  reason: string;
}

// ============ ALIGNMENT RESULT ============

export interface AlignmentResult {
  /** Memories that should be created */
  memoriesToCreate: MemoryCandidate[];
  /** Recall queries that should be executed */
  recallQueries: string[];
  /** Whether the conversation needs context priming */
  needsAlignment: boolean;
  /** Topic for alignment if needed */
  alignmentTopic?: string;
  /** Overall analysis */
  analysis: ConversationAnalysis;
  /** Human-readable explanation of what was detected */
  explanation: string;
}

// ============ SMART ALIGNMENT ENGINE ============

export class SmartAlignmentEngine {
  private config: AlignmentConfig;
  private recentMemories: Map<string, number> = new Map(); // content hash -> timestamp

  constructor(config: Partial<AlignmentConfig> = {}) {
    this.config = { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
  }

  /**
   * Analyze a conversation turn and determine alignment actions
   */
  analyze(userMessage: string, claudeResponse: string): AlignmentResult {
    const analysis = analyzeConversationTurn(userMessage, claudeResponse);
    const memoriesToCreate: MemoryCandidate[] = [];
    const recallQueries: string[] = [];
    let explanation = '';

    // Process user trigger
    if (analysis.userTrigger) {
      const candidate = this.processUserTrigger(analysis.userTrigger, userMessage);
      if (candidate && this.shouldSave(candidate)) {
        memoriesToCreate.push(candidate);
        explanation += `User trigger detected: ${candidate.reason}. `;
      }

      // Check for recall triggers
      if (analysis.userTrigger.type === 'recall' && analysis.userTrigger.extractedContent) {
        recallQueries.push(analysis.userTrigger.extractedContent);
        explanation += `Recall requested for: "${analysis.userTrigger.extractedContent}". `;
      }
    }

    // Process Claude insights
    for (const insight of analysis.claudeInsights) {
      if (insight.confidence >= this.config.claudeInsightThreshold) {
        const candidate = this.processClaudeInsight(insight);
        if (candidate && this.shouldSave(candidate) && !this.isDuplicate(candidate, memoriesToCreate)) {
          memoriesToCreate.push(candidate);
        }
      }
    }

    if (analysis.claudeInsights.length > 0) {
      explanation += `${analysis.claudeInsights.length} insight(s) from Claude detected. `;
    }

    // Process semantic signal
    if (analysis.semanticSignal.signal !== 'routine') {
      explanation += `Semantic signal: ${analysis.semanticSignal.signal} (${analysis.semanticSignal.reason}). `;
      
      // Boost importance for high-signal content
      for (const mem of memoriesToCreate) {
        mem.importance = Math.min(5, mem.importance + analysis.semanticSignal.boost);
      }
    }

    // Check for alignment triggers
    const needsAlignment = analysis.userTrigger?.type === 'align';
    const alignmentTopic = needsAlignment ? analysis.userTrigger?.extractedContent : undefined;

    if (needsAlignment) {
      explanation += `Context alignment requested for: "${alignmentTopic}". `;
    }

    // Limit memories per turn
    const limitedMemories = memoriesToCreate.slice(0, this.config.maxMemoriesPerTurn);
    if (memoriesToCreate.length > this.config.maxMemoriesPerTurn) {
      explanation += `Limited to ${this.config.maxMemoriesPerTurn} memories (${memoriesToCreate.length} detected). `;
    }

    return {
      memoriesToCreate: limitedMemories,
      recallQueries,
      needsAlignment,
      alignmentTopic,
      analysis,
      explanation: explanation.trim() || 'No significant patterns detected.',
    };
  }

  /**
   * Process user message into memory candidate
   */
  private processUserTrigger(trigger: TriggerMatch, fullMessage: string): MemoryCandidate | null {
    if (trigger.type !== 'save' || !trigger.extractedContent) {
      return null;
    }

    const content = trigger.extractedContent;
    const type = trigger.memoryType || detectMemoryType(content);
    const tags = trigger.suggestedTags || detectTags(content);
    const baseImportance = estimateImportance(content);

    return {
      content,
      type,
      tags,
      importance: Math.round(trigger.confidence * baseImportance),
      source: 'user',
      confidence: trigger.confidence,
      trigger: 'implicit',
      reason: `Detected ${type} from user message`,
    };
  }

  /**
   * Process Claude insight into memory candidate
   */
  private processClaudeInsight(insight: TriggerMatch): MemoryCandidate | null {
    if (!insight.extractedContent) {
      return null;
    }

    const content = insight.extractedContent;
    const type = insight.memoryType || detectMemoryType(content);
    const tags = insight.suggestedTags || detectTags(content);
    const baseImportance = estimateImportance(content);

    return {
      content,
      type,
      tags,
      importance: Math.round(insight.confidence * baseImportance),
      source: 'claude',
      confidence: insight.confidence,
      trigger: 'implicit',
      reason: `Claude ${type === 'learning' ? 'discovered' : 'recommended'}: ${content.slice(0, 50)}...`,
    };
  }

  /**
   * Determine if a candidate should be saved
   */
  private shouldSave(candidate: MemoryCandidate): boolean {
    if (!this.config.autoSaveEnabled) {
      return false;
    }

    // Always save certain types
    if (this.config.alwaysSaveTypes.includes(candidate.type)) {
      return true;
    }

    // Check confidence thresholds
    const threshold = candidate.source === 'user' 
      ? this.config.userTriggerThreshold 
      : this.config.claudeInsightThreshold;

    return candidate.confidence >= threshold;
  }

  /**
   * Simple content hash for deduplication
   */
  private hashContent(content: string): string {
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    // Simple hash - in production use proper hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Check if candidate is duplicate of existing
   */
  private isDuplicate(candidate: MemoryCandidate, existing: MemoryCandidate[]): boolean {
    const candidateHash = this.hashContent(candidate.content);
    
    // Check against recent memories
    if (this.recentMemories.has(candidateHash)) {
      return true;
    }

    // Check against other candidates in this batch
    for (const other of existing) {
      const otherHash = this.hashContent(other.content);
      if (candidateHash === otherHash) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mark content as recently saved (for deduplication)
   */
  markAsSaved(content: string): void {
    const hash = this.hashContent(content);
    this.recentMemories.set(hash, Date.now());

    // Cleanup old entries (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, timestamp] of this.recentMemories.entries()) {
      if (timestamp < oneHourAgo) {
        this.recentMemories.delete(key);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AlignmentConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AlignmentConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============ CONVERSATION TRACKER ============

export interface ConversationContext {
  turns: Array<{
    user: string;
    claude: string;
    timestamp: number;
    alignment: AlignmentResult;
  }>;
  cumulativeMemories: MemoryCandidate[];
  topicHistory: string[];
}

export class ConversationTracker {
  private engine: SmartAlignmentEngine;
  private context: ConversationContext;
  private maxTurns: number;

  constructor(config?: Partial<AlignmentConfig>, maxTurns: number = 50) {
    this.engine = new SmartAlignmentEngine(config);
    this.maxTurns = maxTurns;
    this.context = {
      turns: [],
      cumulativeMemories: [],
      topicHistory: [],
    };
  }

  /**
   * Process a new conversation turn
   */
  processTurn(userMessage: string, claudeResponse: string): AlignmentResult {
    const alignment = this.engine.analyze(userMessage, claudeResponse);

    // Track the turn
    this.context.turns.push({
      user: userMessage,
      claude: claudeResponse,
      timestamp: Date.now(),
      alignment,
    });

    // Limit turn history
    if (this.context.turns.length > this.maxTurns) {
      this.context.turns.shift();
    }

    // Track cumulative memories
    this.context.cumulativeMemories.push(...alignment.memoriesToCreate);

    // Track topics
    if (alignment.alignmentTopic) {
      this.context.topicHistory.push(alignment.alignmentTopic);
    }

    // Mark memories as saved for deduplication
    for (const mem of alignment.memoriesToCreate) {
      this.engine.markAsSaved(mem.content);
    }

    return alignment;
  }

  /**
   * Get conversation summary for context
   */
  getSummary(): {
    turnCount: number;
    memoriesCreated: number;
    topMemoryTypes: Record<MemoryType, number>;
    recentTopics: string[];
  } {
    const typeCount: Record<string, number> = {};
    for (const mem of this.context.cumulativeMemories) {
      typeCount[mem.type] = (typeCount[mem.type] || 0) + 1;
    }

    return {
      turnCount: this.context.turns.length,
      memoriesCreated: this.context.cumulativeMemories.length,
      topMemoryTypes: typeCount as Record<MemoryType, number>,
      recentTopics: this.context.topicHistory.slice(-5),
    };
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.context = {
      turns: [],
      cumulativeMemories: [],
      topicHistory: [],
    };
  }

  /**
   * Get the underlying engine
   */
  getEngine(): SmartAlignmentEngine {
    return this.engine;
  }
}

// ============ EXPORTS ============

export { analyzeConversationTurn, detectSemanticSignal };
