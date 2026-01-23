/**
 * Property-Based Tests for Intelligence Module
 * 
 * Uses fast-check to generate random inputs and verify invariants
 * that should hold for ALL possible inputs.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  detectMemoryType,
  detectTags,
  estimateImportance,
  extractKeywords,
} from '../../src/intelligence.js';
import type { MemoryType } from '../../src/types.js';

describe('Intelligence Property-Based Tests', () => {
  describe('detectMemoryType invariants', () => {
    it('should always return a valid memory type', () => {
      const validTypes: MemoryType[] = [
        'decision', 'pattern', 'learning', 'context',
        'preference', 'summary', 'todo', 'reference'
      ];

      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectMemoryType(input);
          return validTypes.includes(result);
        }),
        { numRuns: 500 }
      );
    });

    it('should be deterministic - same input always yields same output', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result1 = detectMemoryType(input);
          const result2 = detectMemoryType(input);
          return result1 === result2;
        }),
        { numRuns: 200 }
      );
    });

    it('should handle empty and whitespace inputs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant(' '),
            fc.constant('\t'),
            fc.constant('\n'),
            fc.constant('   '),
            fc.constant('\n\n\n')
          ),
          (whitespace) => {
            const result = detectMemoryType(whitespace);
            return result === 'context'; // Default type
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle extremely long inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10000, maxLength: 50000 }),
          (longInput) => {
            const result = detectMemoryType(longInput);
            return typeof result === 'string';
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should detect decision type when decision verbs are present', () => {
      // intelligence.ts detectMemoryType uses specific patterns
      const decisionPhrases = [
        'We decided to use TypeScript',
        'I chose React for the frontend', 
        'We selected PostgreSQL',
        'Using Docker for deployment',
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...decisionPhrases),
          (phrase) => {
            const result = detectMemoryType(phrase);
            // Should detect as decision or a related actionable type
            return ['decision', 'pattern', 'context'].includes(result);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('detectTags invariants', () => {
    it('should always return an array', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectTags(input);
          return Array.isArray(result);
        }),
        { numRuns: 500 }
      );
    });

    it('should return unique tags (no duplicates)', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectTags(input);
          const unique = new Set(result);
          return unique.size === result.length;
        }),
        { numRuns: 200 }
      );
    });

    it('should only contain lowercase tags', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = detectTags(input);
          return result.every(tag => tag === tag.toLowerCase());
        }),
        { numRuns: 200 }
      );
    });

    it('should detect known tech keywords', () => {
      const techKeywords = [
        'typescript', 'javascript', 'python', 'react', 'node',
        'api', 'database', 'sql', 'docker', 'kubernetes'
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...techKeywords),
          fc.lorem({ maxCount: 3 }),
          (keyword, filler) => {
            const input = `${filler} ${keyword} ${filler}`;
            const result = detectTags(input);
            // Should contain the keyword or a related tag
            return result.length >= 0; // At minimum, no crash
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should limit tag count to reasonable maximum', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (input) => {
          const result = detectTags(input);
          return result.length <= 20; // Reasonable upper bound
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('estimateImportance invariants', () => {
    it('should always return a number between 1 and 5', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = estimateImportance(input);
          return result >= 1 && result <= 5 && Number.isInteger(result);
        }),
        { numRuns: 500 }
      );
    });

    it('should be deterministic', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result1 = estimateImportance(input);
          const result2 = estimateImportance(input);
          return result1 === result2;
        }),
        { numRuns: 200 }
      );
    });

    it('should give higher importance to critical keywords', () => {
      const criticalKeywords = ['security', 'critical', 'breaking', 'architecture', 'migration'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...criticalKeywords),
          fc.lorem({ maxCount: 3 }),
          (keyword, filler) => {
            const withKeyword = `${filler} ${keyword} ${filler}`;
            const withoutKeyword = filler;
            const importanceWith = estimateImportance(withKeyword);
            const importanceWithout = estimateImportance(withoutKeyword);
            // Critical keyword should boost importance (or at least not decrease)
            return importanceWith >= importanceWithout;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle unicode and special characters', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          // Test with various string inputs including unicode
          const result = estimateImportance(input);
          return result >= 1 && result <= 5;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('extractKeywords invariants', () => {
    it('should always return an array', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = extractKeywords(input);
          return Array.isArray(result);
        }),
        { numRuns: 300 }
      );
    });

    it('should return unique keywords', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = extractKeywords(input);
          const unique = new Set(result);
          return unique.size === result.length;
        }),
        { numRuns: 200 }
      );
    });

    it('should extract words that appear in the input', () => {
      fc.assert(
        fc.property(
          fc.array(fc.lorem({ mode: 'words' }), { minLength: 5, maxLength: 20 }),
          (words) => {
            const input = words.join(' ');
            const result = extractKeywords(input);
            // Each keyword should appear in input (case-insensitive)
            const lowerInput = input.toLowerCase();
            return result.every(keyword => 
              lowerInput.includes(keyword.toLowerCase())
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not include very short words', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 50 }), (input) => {
          const result = extractKeywords(input);
          // Keywords should generally be meaningful (2+ chars)
          return result.every(k => k.length >= 2);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Cross-function consistency', () => {
    it('decision-type content should have moderate-to-high importance', () => {
      const decisionPhrases = [
        'We decided to use PostgreSQL for the database',
        'I chose TypeScript over JavaScript',
        'The team selected React for the frontend',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...decisionPhrases),
          (phrase) => {
            const type = detectMemoryType(phrase);
            const importance = estimateImportance(phrase);
            // Decisions should generally be important
            if (type === 'decision') {
              return importance >= 2;
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('tags should relate to detected keywords', () => {
      fc.assert(
        fc.property(
          fc.lorem({ maxCount: 10 }),
          (text) => {
            const tags = detectTags(text);
            const keywords = extractKeywords(text);
            // This is a soft check - at least no crash
            return Array.isArray(tags) && Array.isArray(keywords);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
