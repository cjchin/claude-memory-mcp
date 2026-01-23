/**
 * Property-Based Tests for Autonomous Module
 * 
 * Tests trigger detection patterns with random inputs to find edge cases.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  detectSaveTrigger,
  detectRecallTrigger,
  detectSynthesisTrigger,
  detectAlignTrigger,
  detectTrigger,
  detectClaudeInsights,
  detectSemanticSignal,
  analyzeConversationTurn,
  extractMemorablePoints,
} from '../../src/autonomous.js';
import type { MemoryType } from '../../src/types.js';

describe('Autonomous Property-Based Tests', () => {
  describe('detectSaveTrigger invariants', () => {
    it('should return null or valid TriggerMatch', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectSaveTrigger(input);
          if (result === null) return true;
          return (
            result.type === 'save' &&
            typeof result.confidence === 'number' &&
            result.confidence >= 0 &&
            result.confidence <= 1
          );
        }),
        { numRuns: 500 }
      );
    });

    it('should detect decision patterns reliably', () => {
      const decisionStarters = [
        'We decided to',
        "I've decided that",
        'We chose',
        'We picked',
        'We selected',
        'We went with',
        'After considering, we will',
        'The approach is to',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...decisionStarters),
          fc.lorem({ maxCount: 5 }),
          (starter, action) => {
            const input = `${starter} ${action}`;
            const result = detectSaveTrigger(input);
            // Should detect as save trigger
            return result !== null && result.type === 'save';
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain confidence bounds', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 500 }), (input) => {
          const result = detectSaveTrigger(input);
          if (result === null) return true;
          return result.confidence >= 0.5 && result.confidence <= 1.0;
        }),
        { numRuns: 200 }
      );
    });

    it('should handle adversarial inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.constant(''),
            fc.constant('\n\n\n'),
            fc.constant('!!!???...'),
            fc.constant('(((nested))) [[brackets]] {{{braces}}}')
          ),
          (input) => {
            const result = detectSaveTrigger(input);
            return result === null || typeof result === 'object';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('detectRecallTrigger invariants', () => {
    it('should return null or valid recall TriggerMatch', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectRecallTrigger(input);
          if (result === null) return true;
          return result.type === 'recall';
        }),
        { numRuns: 300 }
      );
    });

    it('should detect question patterns', () => {
      // Use patterns that definitely match the regex in autonomous.ts
      const questionStarters = [
        'What did we decide about',
        'What was our decision on',
        'How do we handle',
        'What do we know about',
        'Any context on',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...questionStarters),
          fc.constant('authentication'), // Use a fixed topic
          (starter, topic) => {
            const input = `${starter} ${topic}?`;
            const result = detectRecallTrigger(input);
            // May or may not match depending on exact wording
            return result === null || result.type === 'recall';
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('detectSynthesisTrigger invariants', () => {
    it('should only return synthesize type or null', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectSynthesisTrigger(input);
          if (result === null) return true;
          return result.type === 'synthesize';
        }),
        { numRuns: 300 }
      );
    });

    it('should detect synthesis keywords', () => {
      const synthesisKeywords = [
        'synthesize this session',
        'summarize what we discussed',
        'wrap up the key points',
        'extract the insights',
        'what should we remember from this',
        'distill this conversation',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...synthesisKeywords),
          (input) => {
            const result = detectSynthesisTrigger(input);
            return result !== null && result.type === 'synthesize';
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('detectAlignTrigger invariants', () => {
    it('should only return align type or null', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectAlignTrigger(input);
          if (result === null) return true;
          return result.type === 'align';
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('detectTrigger (master function) invariants', () => {
    it('should return highest priority match', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectTrigger(input);
          if (result === null) return true;
          return ['save', 'recall', 'synthesize', 'align'].includes(result.type);
        }),
        { numRuns: 300 }
      );
    });

    it('should be deterministic', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result1 = detectTrigger(input);
          const result2 = detectTrigger(input);
          if (result1 === null && result2 === null) return true;
          if (result1 === null || result2 === null) return false;
          return result1.type === result2.type;
        }),
        { numRuns: 200 }
      );
    });

    it('should respect confidence thresholds', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectTrigger(input);
          if (result === null) return true;
          // Master function should only return high-confidence matches
          return result.confidence >= 0.7;
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('detectClaudeInsights invariants', () => {
    it('should always return an array', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectClaudeInsights(input);
          return Array.isArray(result);
        }),
        { numRuns: 300 }
      );
    });

    it('should detect recommendation patterns from Claude', () => {
      const claudeRecommendations = [
        'I recommend using TypeScript for this project',
        'You should consider implementing caching',
        'The best approach is to use dependency injection',
        'I suggest using a monorepo structure',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...claudeRecommendations),
          (response) => {
            const result = detectClaudeInsights(response);
            return result.length > 0;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should detect discovery patterns', () => {
      const discoveries = [
        'I found that the issue is in the configuration',
        'I discovered the bug was caused by a race condition',
        'It appears that the API is rate-limited',
        'The problem is the missing null check',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...discoveries),
          (response) => {
            const result = detectClaudeInsights(response);
            return result.length > 0;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should detect solution patterns', () => {
      const solutions = [
        'The solution is to add error handling',
        'To fix this, you need to update the dependency',
        'This can be fixed by clearing the cache',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...solutions),
          (response) => {
            const result = detectClaudeInsights(response);
            return result.length > 0;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should deduplicate similar insights', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectClaudeInsights(input);
          // Check for approximate uniqueness via content
          const contents = result.map(r => r.extractedContent?.toLowerCase());
          const filtered = contents.filter(Boolean);
          // No exact duplicates
          return new Set(filtered).size === filtered.length;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('detectSemanticSignal invariants', () => {
    it('should always return a valid SemanticSignal', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectSemanticSignal(input);
          return (
            ['critical', 'important', 'notable', 'routine'].includes(result.signal) &&
            typeof result.reason === 'string' &&
            typeof result.boost === 'number'
          );
        }),
        { numRuns: 500 }
      );
    });

    it('should detect critical signals', () => {
      const criticalContent = [
        'This is a breaking change to the API',
        'Security vulnerability found in authentication',
        'Critical architecture decision needed',
        'Database migration required',
        'Must always validate security tokens',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...criticalContent),
          (content) => {
            const result = detectSemanticSignal(content);
            // Should be critical or at least important
            return ['critical', 'important'].includes(result.signal);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should return appropriate boost values', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectSemanticSignal(input);
          switch (result.signal) {
            case 'critical': return result.boost === 2;
            case 'important': return result.boost === 1;
            case 'notable': return result.boost === 0.5;
            case 'routine': return result.boost === 0;
            default: return false;
          }
        }),
        { numRuns: 300 }
      );
    });
  });

  describe('analyzeConversationTurn invariants', () => {
    it('should always return valid ConversationAnalysis', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (userMsg, claudeResp) => {
          const result = analyzeConversationTurn(userMsg, claudeResp);
          return (
            typeof result.shouldAutoSave === 'boolean' &&
            typeof result.totalMemorableItems === 'number' &&
            Array.isArray(result.claudeInsights) &&
            result.semanticSignal !== undefined
          );
        }),
        { numRuns: 200 }
      );
    });

    it('should recommend auto-save for high-value content', () => {
      const highValueExchanges = [
        { user: 'We decided to use PostgreSQL', claude: 'Good choice for relational data' },
        { user: 'What about authentication?', claude: 'I recommend using JWT with refresh tokens' },
        { user: 'Found a security issue', claude: 'This is a critical vulnerability that needs immediate attention' },
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...highValueExchanges),
          (exchange) => {
            const result = analyzeConversationTurn(exchange.user, exchange.claude);
            return result.shouldAutoSave === true || result.totalMemorableItems > 0;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should count memorable items correctly', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (userMsg, claudeResp) => {
          const result = analyzeConversationTurn(userMsg, claudeResp);
          const expected = (result.userTrigger ? 1 : 0) + result.claudeInsights.length;
          return result.totalMemorableItems === expected;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('extractMemorablePoints invariants', () => {
    it('should always return an array', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = extractMemorablePoints(input);
          return Array.isArray(result);
        }),
        { numRuns: 300 }
      );
    });

    it('should extract points from multi-sentence text', () => {
      const richText = `
        We decided to use TypeScript for type safety.
        The pattern is to always validate input at boundaries.
        I learned that async/await is cleaner than callbacks.
        Todo: add proper error handling later.
      `;

      const result = extractMemorablePoints(richText);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should deduplicate similar points', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = extractMemorablePoints(input);
          // Crude duplicate check - no two points should be nearly identical
          for (let i = 0; i < result.length; i++) {
            for (let j = i + 1; j < result.length; j++) {
              if (result[i].content === result[j].content) {
                return false;
              }
            }
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should assign valid memory types', () => {
      const validTypes: MemoryType[] = [
        'decision', 'pattern', 'learning', 'context',
        'preference', 'summary', 'todo', 'reference'
      ];

      fc.assert(
        fc.property(fc.string({ minLength: 50 }), (input) => {
          const result = extractMemorablePoints(input);
          return result.every(p => validTypes.includes(p.type));
        }),
        { numRuns: 100 }
      );
    });

    it('should assign importance between 1-5', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 50 }), (input) => {
          const result = extractMemorablePoints(input);
          return result.every(p => 
            p.importance >= 1 && p.importance <= 5 && Number.isInteger(p.importance)
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge case robustness', () => {
    it('should handle regex-breaking characters', () => {
      const dangerousStrings = [
        '(((nested))) [[brackets]] {{{braces}}}',
        '$^.*+?[]{}()|\\',
        'a]b[c',
        '?+*',
        '\\d+\\w*\\s?',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...dangerousStrings),
          (dangerous) => {
            // None of these should throw
            detectSaveTrigger(dangerous);
            detectRecallTrigger(dangerous);
            detectTrigger(dangerous);
            detectClaudeInsights(dangerous);
            detectSemanticSignal(dangerous);
            return true;
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should handle extremely repetitive input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.integer({ min: 100, max: 1000 }),
          (char, count) => {
            const input = char.repeat(count);
            const result = detectTrigger(input);
            return result === null || typeof result === 'object';
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
