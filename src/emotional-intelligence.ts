/**
 * Emotional Intelligence Module - Phase 1 of v3.0 Evolution
 *
 * Implements affective dimension for memories:
 * - Sentiment analysis (lexicon-based)
 * - Emotion detection (NRC Emotion Lexicon)
 * - Emotional decay algorithms
 * - Emotional querying and filtering
 *
 * Theoretical foundations:
 * - Russell's Circumplex Model of Affect (valence-arousal)
 * - Ekman's Basic Emotions
 * - Hedonic adaptation (positive emotions fade faster)
 * - Negativity bias (negative emotions linger)
 * - Flashbulb memory effect (high arousal resists decay)
 */

import type { EmotionalContext, BasicEmotion, Memory, EmotionalDecayConfig } from "./types.js";

// ============================================================================
// AFINN Sentiment Lexicon (simplified subset for initial implementation)
// ============================================================================

/**
 * AFINN-111 sentiment lexicon (subset)
 * Maps words to sentiment scores: -5 (very negative) to +5 (very positive)
 *
 * Full implementation should load from external lexicon file.
 * This is a minimal starter set for testing.
 */
const AFINN_LEXICON: Record<string, number> = {
  // Positive words
  "excellent": 4,
  "good": 3,
  "great": 3,
  "happy": 3,
  "joy": 3,
  "love": 3,
  "wonderful": 4,
  "best": 3,
  "fantastic": 4,
  "amazing": 4,
  "awesome": 4,
  "brilliant": 4,
  "perfect": 3,
  "success": 2,
  "win": 3,
  "beautiful": 3,
  "like": 2,
  "easy": 1,
  "thanks": 2,
  "helpful": 2,
  "better": 2,
  "improved": 2,

  // Negative words
  "bad": -3,
  "terrible": -3,
  "horrible": -3,
  "awful": -3,
  "worst": -3,
  "hate": -3,
  "angry": -3,
  "sad": -2,
  "fear": -2,
  "worried": -2,
  "problem": -2,
  "issue": -2,
  "bug": -2,
  "error": -2,
  "fail": -3,
  "failed": -3,
  "broken": -2,
  "wrong": -2,
  "difficult": -2,
  "hard": -1,
  "confused": -2,
  "frustrating": -2,
  "annoying": -2,
  "disappointing": -2,
};

/**
 * NRC Emotion Lexicon (simplified subset)
 * Maps words to basic emotions (Ekman's six + anticipation, trust)
 *
 * Full implementation should load from external NRC lexicon file.
 */
const NRC_EMOTION_LEXICON: Record<string, BasicEmotion[]> = {
  // Joy
  "happy": ["joy"],
  "joy": ["joy"],
  "excellent": ["joy"],
  "wonderful": ["joy"],
  "love": ["joy"],
  "amazing": ["joy"],
  "fantastic": ["joy"],
  "brilliant": ["joy"],
  "success": ["joy"],
  "win": ["joy"],

  // Sadness
  "sad": ["sadness"],
  "unhappy": ["sadness"],
  "depressed": ["sadness"],
  "disappointed": ["sadness"],
  "fail": ["sadness"],
  "loss": ["sadness"],

  // Fear
  "fear": ["fear"],
  "afraid": ["fear"],
  "scared": ["fear"],
  "worried": ["fear"],
  "anxious": ["fear"],
  "nervous": ["fear"],
  "terrified": ["fear"],

  // Anger
  "angry": ["anger"],
  "mad": ["anger"],
  "furious": ["anger"],
  "annoyed": ["anger"],
  "frustrated": ["anger"],
  "irritated": ["anger"],

  // Surprise
  "surprised": ["surprise"],
  "shocked": ["surprise"],
  "amazed": ["surprise"],
  "astonished": ["surprise"],

  // Disgust
  "disgusted": ["disgust"],
  "revolting": ["disgust"],
  "awful": ["disgust"],
  "terrible": ["disgust"],
};

// ============================================================================
// Arousal Lexicon (maps words to arousal levels)
// ============================================================================

/**
 * Arousal lexicon - maps words to arousal level (0-1)
 * High arousal: excited, anxious, angry
 * Low arousal: calm, tired, relaxed
 */
const AROUSAL_LEXICON: Record<string, number> = {
  // High arousal (excited, activated)
  "excited": 0.9,
  "anxious": 0.8,
  "angry": 0.9,
  "furious": 0.95,
  "thrilled": 0.9,
  "panicked": 0.95,
  "shocked": 0.9,
  "amazed": 0.8,
  "terrified": 0.95,

  // Medium arousal
  "happy": 0.6,
  "sad": 0.4,
  "worried": 0.6,
  "frustrated": 0.7,
  "surprised": 0.7,
  "annoyed": 0.6,

  // Low arousal (calm, deactivated)
  "calm": 0.1,
  "relaxed": 0.2,
  "tired": 0.2,
  "bored": 0.2,
  "peaceful": 0.15,
  "content": 0.3,
};

// ============================================================================
// Emotional Decay Configuration
// ============================================================================

/**
 * Default emotional decay parameters
 * Based on psychological research:
 * - Positive emotions fade ~2x faster than negative (hedonic adaptation)
 * - High arousal memories resist decay (flashbulb effect)
 */
export const DEFAULT_EMOTIONAL_DECAY: EmotionalDecayConfig = {
  positive_decay_rate: 0.15,    // 15% per day for positive emotions
  negative_decay_rate: 0.08,    // 8% per day for negative emotions
  arousal_protection: 0.5,      // 50% decay reduction for high arousal
  flashbulb_threshold: 0.8,     // Arousal > 0.8 triggers flashbulb effect
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Infer emotional context from text content
 *
 * Uses lexicon-based approach:
 * 1. Calculate valence from AFINN sentiment scores
 * 2. Detect emotions from NRC lexicon
 * 3. Calculate arousal from arousal lexicon
 * 4. Map to Russell's Circumplex Model
 *
 * @param content - Text to analyze
 * @param explicitEmotion - User-specified emotion (optional)
 * @returns EmotionalContext with valence, arousal, and dominant emotion
 */
export function inferEmotionalContext(
  content: string,
  explicitEmotion?: BasicEmotion
): EmotionalContext {
  // Normalize content: lowercase, split into words
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];

  // Calculate valence from AFINN lexicon
  let totalSentiment = 0;
  let sentimentWordCount = 0;

  for (const word of words) {
    if (word in AFINN_LEXICON) {
      totalSentiment += AFINN_LEXICON[word];
      sentimentWordCount++;
    }
  }

  // Normalize valence to -1 to +1 range
  const valence = sentimentWordCount > 0
    ? Math.max(-1, Math.min(1, totalSentiment / (sentimentWordCount * 5)))
    : 0;

  // Detect emotions from NRC lexicon
  const emotionCounts: Record<string, number> = {};
  for (const word of words) {
    if (word in NRC_EMOTION_LEXICON) {
      for (const emotion of NRC_EMOTION_LEXICON[word]) {
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
      }
    }
  }

  // Calculate arousal from arousal lexicon
  let totalArousal = 0;
  let arousalWordCount = 0;

  for (const word of words) {
    if (word in AROUSAL_LEXICON) {
      totalArousal += AROUSAL_LEXICON[word];
      arousalWordCount++;
    }
  }

  const arousal = arousalWordCount > 0
    ? totalArousal / arousalWordCount
    : 0.3; // Default to medium-low arousal

  // Determine dominant emotion
  let dominantEmotion: BasicEmotion | undefined;
  let maxCount = 0;

  if (explicitEmotion) {
    dominantEmotion = explicitEmotion;
  } else if (Object.keys(emotionCounts).length > 0) {
    for (const [emotion, count] of Object.entries(emotionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion as BasicEmotion;
      }
    }
  } else {
    // Infer from valence if no explicit emotions detected
    if (valence > 0.3) {
      dominantEmotion = "joy";
    } else if (valence < -0.3) {
      dominantEmotion = arousal > 0.6 ? "anger" : "sadness";
    } else {
      dominantEmotion = "neutral";
    }
  }

  // Build secondary emotions (emotions with non-zero counts)
  const secondaryEmotions = Object.entries(emotionCounts)
    .filter(([emotion]) => emotion !== dominantEmotion)
    .map(([emotion, count]) => ({
      emotion,
      intensity: count / words.length, // Normalize by text length
    }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 3); // Keep top 3 secondary emotions

  // Calculate confidence based on lexicon coverage
  const lexiconCoverage = (sentimentWordCount + arousalWordCount) / words.length;
  const emotionalConfidence = Math.min(1, lexiconCoverage * 2); // Scale to 0-1

  return {
    valence,
    arousal,
    dominant_emotion: dominantEmotion,
    secondary_emotions: secondaryEmotions.length > 0 ? secondaryEmotions : undefined,
    emotional_confidence: emotionalConfidence,
    detected_by: explicitEmotion ? "user_specified" : "inferred",
    emotional_timestamp: new Date().toISOString(),
  };
}

/**
 * Apply emotional decay to a memory's emotional context
 *
 * Models psychological phenomena:
 * - Hedonic adaptation: positive emotions fade faster
 * - Negativity bias: negative emotions persist longer
 * - Flashbulb memory: high arousal resists decay
 *
 * @param emotion - Current emotional context
 * @param daysSinceCapture - Days elapsed since emotional_timestamp
 * @param config - Decay configuration (optional)
 * @returns Updated emotional context with decayed valence
 */
export function applyEmotionalDecay(
  emotion: EmotionalContext,
  daysSinceCapture: number,
  config: EmotionalDecayConfig = DEFAULT_EMOTIONAL_DECAY
): EmotionalContext {
  if (!emotion.emotional_timestamp) {
    return emotion; // No decay if no timestamp
  }

  const { valence, arousal } = emotion;

  // Determine decay rate based on valence polarity
  const isPositive = valence > 0;
  const baseDecayRate = isPositive
    ? config.positive_decay_rate
    : config.negative_decay_rate;

  // Apply arousal protection (flashbulb effect)
  const arousalProtectionFactor = arousal >= config.flashbulb_threshold
    ? config.arousal_protection
    : 0;

  const effectiveDecayRate = baseDecayRate * (1 - arousalProtectionFactor);

  // Calculate decay: exponential decay toward neutral (0)
  const decayFactor = Math.exp(-effectiveDecayRate * daysSinceCapture);
  const decayedValence = valence * decayFactor;

  return {
    ...emotion,
    valence: decayedValence,
    initial_emotion: emotion.initial_emotion || emotion.dominant_emotion,
    current_emotion: mapValenceToEmotion(decayedValence, arousal),
  };
}

/**
 * Map valence and arousal to a basic emotion (Russell's Circumplex)
 *
 * Quadrants:
 * - High arousal + positive valence = joy
 * - High arousal + negative valence = anger/fear
 * - Low arousal + positive valence = neutral (content)
 * - Low arousal + negative valence = sadness
 *
 * @param valence - Emotional valence (-1 to +1)
 * @param arousal - Emotional arousal (0 to 1)
 * @returns Basic emotion label
 */
function mapValenceToEmotion(valence: number, arousal: number): string {
  if (Math.abs(valence) < 0.2 && arousal < 0.3) {
    return "neutral";
  }

  if (valence > 0.3) {
    return arousal > 0.6 ? "joy" : "content";
  }

  if (valence < -0.3) {
    if (arousal > 0.7) {
      return "anger";
    } else if (arousal > 0.5) {
      return "fear";
    } else {
      return "sadness";
    }
  }

  return "neutral";
}

/**
 * Filter memories by emotional criteria
 *
 * Supports queries like:
 * - "Find memories with positive valence"
 * - "Find high arousal memories"
 * - "Find memories about anger"
 *
 * @param memories - Array of memories to filter
 * @param criteria - Emotional filter criteria
 * @returns Filtered memories
 */
export function filterByEmotion(
  memories: Memory[],
  criteria: {
    minValence?: number;
    maxValence?: number;
    minArousal?: number;
    maxArousal?: number;
    emotion?: BasicEmotion;
  }
): Memory[] {
  return memories.filter(memory => {
    if (!memory.emotional_context) {
      return false;
    }

    const { valence, arousal, dominant_emotion } = memory.emotional_context;

    // Check valence range
    if (criteria.minValence !== undefined && valence < criteria.minValence) {
      return false;
    }
    if (criteria.maxValence !== undefined && valence > criteria.maxValence) {
      return false;
    }

    // Check arousal range
    if (criteria.minArousal !== undefined && arousal < criteria.minArousal) {
      return false;
    }
    if (criteria.maxArousal !== undefined && arousal > criteria.maxArousal) {
      return false;
    }

    // Check specific emotion
    if (criteria.emotion && dominant_emotion !== criteria.emotion) {
      return false;
    }

    return true;
  });
}

/**
 * Detect emotional shift between two memories
 *
 * Useful for identifying belief updates with emotional valence changes.
 * Example: "We decided to use X" (positive) → "X turned out to be a mistake" (negative)
 *
 * @param oldMemory - Previous memory
 * @param newMemory - Current memory
 * @returns Emotional shift description or null if no shift detected
 */
export function detectEmotionalShift(
  oldMemory: Memory,
  newMemory: Memory
): { from: BasicEmotion; to: BasicEmotion; magnitude: number; } | null {
  const oldEmotion = oldMemory.emotional_context;
  const newEmotion = newMemory.emotional_context;

  if (!oldEmotion || !newEmotion) {
    return null;
  }

  const valenceDelta = Math.abs(newEmotion.valence - oldEmotion.valence);
  const arousalDelta = Math.abs(newEmotion.arousal - oldEmotion.arousal);

  // Significant shift threshold: valence change > 0.4 or arousal change > 0.3
  if (valenceDelta < 0.4 && arousalDelta < 0.3) {
    return null;
  }

  return {
    from: oldEmotion.dominant_emotion || "neutral",
    to: newEmotion.dominant_emotion || "neutral",
    magnitude: Math.max(valenceDelta, arousalDelta),
  };
}

/**
 * Calculate days elapsed since emotional capture
 *
 * Helper for decay calculations.
 *
 * @param emotionalTimestamp - ISO timestamp of emotional capture
 * @returns Days elapsed (fractional)
 */
export function daysSinceEmotionalCapture(emotionalTimestamp: string): number {
  const captured = new Date(emotionalTimestamp).getTime();
  const now = Date.now();
  const elapsed = now - captured;
  return elapsed / (1000 * 60 * 60 * 24);
}
