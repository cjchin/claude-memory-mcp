/**
 * Unit tests for Emotional Intelligence Module
 *
 * Tests Phase 1 implementation:
 * - Sentiment analysis (lexicon-based)
 * - Emotion detection
 * - Emotional decay algorithms
 * - Emotional filtering
 */

import { describe, it, expect } from "vitest";
import {
  inferEmotionalContext,
  applyEmotionalDecay,
  filterByEmotion,
  detectEmotionalShift,
  daysSinceEmotionalCapture,
  DEFAULT_EMOTIONAL_DECAY,
} from "../../src/emotional-intelligence.js";
import type { Memory, EmotionalContext } from "../../src/types.js";

describe("Emotional Intelligence", () => {
  describe("inferEmotionalContext", () => {
    it("should detect positive valence from positive words", () => {
      const content = "This is excellent work! I'm really happy with the results. Great job!";
      const emotion = inferEmotionalContext(content);

      expect(emotion.valence).toBeGreaterThan(0.5);
      expect(emotion.dominant_emotion).toBe("joy");
      expect(emotion.detected_by).toBe("inferred");
    });

    it("should detect negative valence from negative words", () => {
      const content = "This is terrible. I'm very disappointed and frustrated with the bugs.";
      const emotion = inferEmotionalContext(content);

      expect(emotion.valence).toBeLessThan(-0.3);
      expect(emotion.dominant_emotion).toMatch(/^(sadness|anger|disgust)$/);
      expect(emotion.detected_by).toBe("inferred");
    });

    it("should detect neutral content", () => {
      const content = "The function returns a list of items from the database.";
      const emotion = inferEmotionalContext(content);

      expect(emotion.valence).toBeGreaterThanOrEqual(-0.3);
      expect(emotion.valence).toBeLessThanOrEqual(0.3);
      expect(emotion.dominant_emotion).toBe("neutral");
    });

    it("should respect explicit emotion override", () => {
      const content = "This is neutral technical content.";
      const emotion = inferEmotionalContext(content, "anger");

      expect(emotion.dominant_emotion).toBe("anger");
      expect(emotion.detected_by).toBe("user_specified");
    });

    it("should calculate arousal from arousal lexicon", () => {
      const highArousal = "I'm so excited and thrilled about this!";
      const emotionHigh = inferEmotionalContext(highArousal);
      expect(emotionHigh.arousal).toBeGreaterThan(0.6);

      const lowArousal = "I feel calm and relaxed about this.";
      const emotionLow = inferEmotionalContext(lowArousal);
      expect(emotionLow.arousal).toBeLessThan(0.4);
    });

    it("should detect secondary emotions", () => {
      const content = "I'm happy but also surprised and a bit worried.";
      const emotion = inferEmotionalContext(content);

      expect(emotion.secondary_emotions).toBeDefined();
      expect(emotion.secondary_emotions!.length).toBeGreaterThan(0);
    });

    it("should calculate confidence based on lexicon coverage", () => {
      const highCoverage = "happy excellent wonderful amazing";
      const emotionHigh = inferEmotionalContext(highCoverage);
      expect(emotionHigh.emotional_confidence).toBeGreaterThan(0.5);

      const lowCoverage = "the of and to a in is it";
      const emotionLow = inferEmotionalContext(lowCoverage);
      expect(emotionLow.emotional_confidence).toBeLessThan(0.3);
    });

    it("should include timestamp", () => {
      const content = "Test content";
      const emotion = inferEmotionalContext(content);

      expect(emotion.emotional_timestamp).toBeDefined();
      expect(new Date(emotion.emotional_timestamp!).getTime()).toBeGreaterThan(0);
    });
  });

  describe("applyEmotionalDecay", () => {
    it("should decay positive emotions faster than negative", () => {
      const positiveEmotion: EmotionalContext = {
        valence: 0.8,
        arousal: 0.5,
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      };

      const negativeEmotion: EmotionalContext = {
        valence: -0.8,
        arousal: 0.5,
        dominant_emotion: "sadness",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const decayedPositive = applyEmotionalDecay(positiveEmotion, 30);
      const decayedNegative = applyEmotionalDecay(negativeEmotion, 30);

      // Positive should decay more (closer to 0)
      expect(Math.abs(decayedPositive.valence)).toBeLessThan(Math.abs(decayedNegative.valence));
    });

    it("should protect high arousal memories from decay (flashbulb effect)", () => {
      const highArousal: EmotionalContext = {
        valence: 0.8,
        arousal: 0.9, // High arousal
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const lowArousal: EmotionalContext = {
        valence: 0.8,
        arousal: 0.2, // Low arousal
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const decayedHigh = applyEmotionalDecay(highArousal, 30);
      const decayedLow = applyEmotionalDecay(lowArousal, 30);

      // High arousal should resist decay better
      expect(decayedHigh.valence).toBeGreaterThan(decayedLow.valence);
    });

    it("should set initial and current emotion on first decay", () => {
      const emotion: EmotionalContext = {
        valence: 0.8,
        arousal: 0.5,
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const decayed = applyEmotionalDecay(emotion, 10);

      expect(decayed.initial_emotion).toBe("joy");
      expect(decayed.current_emotion).toBeDefined();
    });

    it("should not decay emotions without timestamp", () => {
      const emotion: EmotionalContext = {
        valence: 0.8,
        arousal: 0.5,
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        // No timestamp
      };

      const decayed = applyEmotionalDecay(emotion, 30);
      expect(decayed.valence).toBe(0.8); // No change
    });

    it("should use custom decay configuration", () => {
      const emotion: EmotionalContext = {
        valence: 0.8,
        arousal: 0.5,
        dominant_emotion: "joy",
        emotional_confidence: 0.9,
        detected_by: "inferred",
        emotional_timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const customConfig = {
        ...DEFAULT_EMOTIONAL_DECAY,
        positive_decay_rate: 0.3, // Much faster decay
      };

      const decayedDefault = applyEmotionalDecay(emotion, 10);
      const decayedCustom = applyEmotionalDecay(emotion, 10, customConfig);

      expect(decayedCustom.valence).toBeLessThan(decayedDefault.valence);
    });
  });

  describe("filterByEmotion", () => {
    const memories: Memory[] = [
      {
        id: "mem_1",
        content: "Happy memory",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: 0.8,
          arousal: 0.6,
          dominant_emotion: "joy",
          emotional_confidence: 0.9,
          detected_by: "inferred",
        },
      },
      {
        id: "mem_2",
        content: "Sad memory",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: -0.7,
          arousal: 0.3,
          dominant_emotion: "sadness",
          emotional_confidence: 0.9,
          detected_by: "inferred",
        },
      },
      {
        id: "mem_3",
        content: "Angry memory",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: -0.6,
          arousal: 0.9,
          dominant_emotion: "anger",
          emotional_confidence: 0.9,
          detected_by: "inferred",
        },
      },
      {
        id: "mem_4",
        content: "Neutral memory",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        // No emotional context
      },
    ];

    it("should filter by positive valence", () => {
      const filtered = filterByEmotion(memories, { minValence: 0.5 });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("mem_1");
    });

    it("should filter by negative valence", () => {
      const filtered = filterByEmotion(memories, { maxValence: -0.5 });
      expect(filtered.length).toBe(2);
      expect(filtered.map(m => m.id).sort()).toEqual(["mem_2", "mem_3"]);
    });

    it("should filter by high arousal", () => {
      const filtered = filterByEmotion(memories, { minArousal: 0.8 });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("mem_3");
    });

    it("should filter by specific emotion", () => {
      const filtered = filterByEmotion(memories, { emotion: "sadness" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("mem_2");
    });

    it("should filter by combined criteria", () => {
      const filtered = filterByEmotion(memories, {
        maxValence: 0,
        minArousal: 0.5,
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("mem_3"); // Negative + high arousal = anger
    });

    it("should exclude memories without emotional context", () => {
      const filtered = filterByEmotion(memories, { minValence: -1 });
      expect(filtered.length).toBe(3); // mem_4 excluded (no emotional_context)
    });
  });

  describe("detectEmotionalShift", () => {
    it("should detect shift from positive to negative", () => {
      const oldMemory: Memory = {
        id: "mem_1",
        content: "We decided to use library X because it's great",
        type: "decision",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 4,
        access_count: 0,
        emotional_context: {
          valence: 0.7,
          arousal: 0.5,
          dominant_emotion: "joy",
          emotional_confidence: 0.8,
          detected_by: "inferred",
        },
      };

      const newMemory: Memory = {
        id: "mem_2",
        content: "Library X turned out to be a terrible mistake",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 4,
        access_count: 0,
        emotional_context: {
          valence: -0.8,
          arousal: 0.6,
          dominant_emotion: "anger",
          emotional_confidence: 0.9,
          detected_by: "inferred",
        },
      };

      const shift = detectEmotionalShift(oldMemory, newMemory);

      expect(shift).not.toBeNull();
      expect(shift!.from).toBe("joy");
      expect(shift!.to).toBe("anger");
      expect(shift!.magnitude).toBeGreaterThan(1.0);
    });

    it("should not detect shift for similar emotions", () => {
      const oldMemory: Memory = {
        id: "mem_1",
        content: "Positive",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: 0.6,
          arousal: 0.5,
          dominant_emotion: "joy",
          emotional_confidence: 0.8,
          detected_by: "inferred",
        },
      };

      const newMemory: Memory = {
        id: "mem_2",
        content: "Still positive",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: 0.65,
          arousal: 0.52,
          dominant_emotion: "joy",
          emotional_confidence: 0.8,
          detected_by: "inferred",
        },
      };

      const shift = detectEmotionalShift(oldMemory, newMemory);
      expect(shift).toBeNull();
    });

    it("should return null if either memory lacks emotional context", () => {
      const withEmotion: Memory = {
        id: "mem_1",
        content: "Has emotion",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
        emotional_context: {
          valence: 0.7,
          arousal: 0.5,
          dominant_emotion: "joy",
          emotional_confidence: 0.8,
          detected_by: "inferred",
        },
      };

      const withoutEmotion: Memory = {
        id: "mem_2",
        content: "No emotion",
        type: "learning",
        tags: [],
        timestamp: new Date().toISOString(),
        importance: 3,
        access_count: 0,
      };

      const shift1 = detectEmotionalShift(withEmotion, withoutEmotion);
      const shift2 = detectEmotionalShift(withoutEmotion, withEmotion);

      expect(shift1).toBeNull();
      expect(shift2).toBeNull();
    });
  });

  describe("daysSinceEmotionalCapture", () => {
    it("should calculate days correctly", () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const days = daysSinceEmotionalCapture(tenDaysAgo);

      expect(days).toBeGreaterThan(9.9);
      expect(days).toBeLessThan(10.1);
    });

    it("should handle recent timestamps", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const days = daysSinceEmotionalCapture(oneHourAgo);

      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThan(0.1);
    });
  });
});
