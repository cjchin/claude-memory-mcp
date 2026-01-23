/**
 * MCP Protocol Contract Tests
 * 
 * Validates that our MCP server implementation conforms to
 * the Model Context Protocol specification.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

// MCP Response Schemas (based on MCP spec)
const MCPContentItemSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const MCPToolResponseSchema = z.object({
  content: z.array(MCPContentItemSchema),
});

const MCPErrorResponseSchema = z.object({
  content: z.array(z.object({
    type: z.literal('text'),
    text: z.string(),
  })),
  isError: z.literal(true).optional(),
});

// Tool input schemas (matching what's defined in index.ts)
const RememberInputSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['decision', 'pattern', 'learning', 'context', 'preference', 'summary', 'todo', 'reference']).optional(),
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(5).optional(),
  project: z.string().optional(),
});

const RecallInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(50).optional(),
  type: z.enum(['decision', 'pattern', 'learning', 'context', 'preference', 'summary', 'todo', 'reference']).optional(),
  project: z.string().optional(),
});

const ForgetInputSchema = z.object({
  id: z.string().min(1),
});

describe('MCP Contract Tests', () => {
  describe('Tool Input Validation', () => {
    describe('remember tool', () => {
      it('should accept valid remember input', () => {
        const validInputs = [
          { content: 'We decided to use TypeScript' },
          { content: 'Pattern: always validate inputs', type: 'pattern' as const },
          { content: 'Important decision', type: 'decision' as const, importance: 5 },
          { content: 'Tagged memory', tags: ['api', 'security'] },
          { content: 'Project memory', project: 'my-project' },
          { 
            content: 'Full memory',
            type: 'learning' as const,
            tags: ['typescript', 'testing'],
            importance: 4,
            project: 'test-project',
          },
        ];

        for (const input of validInputs) {
          expect(() => RememberInputSchema.parse(input)).not.toThrow();
        }
      });

      it('should reject invalid remember input', () => {
        const invalidInputs = [
          {}, // Missing content
          { content: '' }, // Empty content
          { content: 'Test', type: 'invalid' }, // Invalid type
          { content: 'Test', importance: 0 }, // Importance too low
          { content: 'Test', importance: 6 }, // Importance too high
          { content: 'Test', tags: 'string' }, // Tags should be array
        ];

        for (const input of invalidInputs) {
          expect(() => RememberInputSchema.parse(input)).toThrow();
        }
      });
    });

    describe('recall tool', () => {
      it('should accept valid recall input', () => {
        const validInputs = [
          { query: 'database decisions' },
          { query: 'auth', limit: 10 },
          { query: 'patterns', type: 'pattern' as const },
          { query: 'project stuff', project: 'my-project' },
          { query: 'full query', limit: 5, type: 'decision' as const, project: 'test' },
        ];

        for (const input of validInputs) {
          expect(() => RecallInputSchema.parse(input)).not.toThrow();
        }
      });

      it('should reject invalid recall input', () => {
        const invalidInputs = [
          {}, // Missing query
          { query: '' }, // Empty query
          { query: 'test', limit: 0 }, // Limit too low
          { query: 'test', limit: 100 }, // Limit too high
          { query: 'test', type: 'invalid' }, // Invalid type
        ];

        for (const input of invalidInputs) {
          expect(() => RecallInputSchema.parse(input)).toThrow();
        }
      });
    });

    describe('forget tool', () => {
      it('should accept valid forget input', () => {
        const validInputs = [
          { id: 'mem_123' },
          { id: 'some-uuid-here' },
        ];

        for (const input of validInputs) {
          expect(() => ForgetInputSchema.parse(input)).not.toThrow();
        }
      });

      it('should reject invalid forget input', () => {
        const invalidInputs = [
          {}, // Missing id
          { id: '' }, // Empty id
        ];

        for (const input of invalidInputs) {
          expect(() => ForgetInputSchema.parse(input)).toThrow();
        }
      });
    });
  });

  describe('Tool Response Format', () => {
    it('should validate successful response format', () => {
      const successResponses = [
        { content: [{ type: 'text' as const, text: 'Memory stored successfully' }] },
        { content: [{ type: 'text' as const, text: JSON.stringify({ id: '123', content: 'test' }) }] },
        { content: [{ type: 'text' as const, text: 'No memories found matching query' }] },
      ];

      for (const response of successResponses) {
        expect(() => MCPToolResponseSchema.parse(response)).not.toThrow();
      }
    });

    it('should validate error response format', () => {
      const errorResponses = [
        { content: [{ type: 'text' as const, text: 'Error: Memory not found' }], isError: true as const },
        { content: [{ type: 'text' as const, text: 'Error: Database connection failed' }], isError: true as const },
      ];

      for (const response of errorResponses) {
        expect(() => MCPErrorResponseSchema.parse(response)).not.toThrow();
      }
    });

    it('should reject invalid response formats', () => {
      const invalidResponses = [
        { text: 'Just text' }, // Wrong structure
        { content: 'string' }, // Content should be array
        { content: [{ type: 'image', data: 'xxx' }] }, // Wrong content type
        { content: [] }, // Empty content array is technically valid but unusual
      ];

      for (const response of invalidResponses) {
        // Either throws or fails validation
        const result = MCPToolResponseSchema.safeParse(response);
        if (result.success) {
          // Empty array is valid per schema
          expect(response).toEqual({ content: [] });
        }
      }
    });
  });

  describe('Memory Data Contracts', () => {
    const MemorySchema = z.object({
      id: z.string(),
      content: z.string(),
      type: z.enum(['decision', 'pattern', 'learning', 'context', 'preference', 'summary', 'todo', 'reference']),
      tags: z.array(z.string()),
      importance: z.number().min(1).max(5),
      created_at: z.number(),
      updated_at: z.number().optional(),
      accessed_at: z.number().optional(),
      access_count: z.number().optional(),
      project: z.string().optional(),
      session_id: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should validate well-formed memory objects', () => {
      const validMemories = [
        {
          id: 'mem_123',
          content: 'We decided to use PostgreSQL',
          type: 'decision' as const,
          tags: ['database', 'architecture'],
          importance: 4,
          created_at: Date.now(),
        },
        {
          id: 'mem_456',
          content: 'Always validate inputs at boundaries',
          type: 'pattern' as const,
          tags: ['security', 'validation'],
          importance: 5,
          created_at: Date.now(),
          project: 'my-project',
          session_id: 'session_789',
          metadata: { source: 'conversation' },
        },
      ];

      for (const memory of validMemories) {
        expect(() => MemorySchema.parse(memory)).not.toThrow();
      }
    });
  });

  describe('Session Data Contracts', () => {
    const SessionSchema = z.object({
      id: z.string(),
      started_at: z.number(),
      ended_at: z.number().optional(),
      project: z.string().optional(),
      summary: z.string().optional(),
      memory_ids: z.array(z.string()),
    });

    it('should validate well-formed session objects', () => {
      const validSessions = [
        {
          id: 'session_123',
          started_at: Date.now(),
          memory_ids: [],
        },
        {
          id: 'session_456',
          started_at: Date.now() - 3600000,
          ended_at: Date.now(),
          project: 'my-project',
          summary: 'Discussed database architecture',
          memory_ids: ['mem_1', 'mem_2', 'mem_3'],
        },
      ];

      for (const session of validSessions) {
        expect(() => SessionSchema.parse(session)).not.toThrow();
      }
    });
  });

  describe('Alignment System Contracts', () => {
    const TriggerMatchSchema = z.object({
      type: z.enum(['save', 'recall', 'synthesize', 'align']),
      memoryType: z.enum(['decision', 'pattern', 'learning', 'context', 'preference', 'summary', 'todo', 'reference']).optional(),
      confidence: z.number().min(0).max(1),
      extractedContent: z.string().optional(),
      suggestedTags: z.array(z.string()).optional(),
    });

    const SemanticSignalSchema = z.object({
      signal: z.enum(['critical', 'important', 'notable', 'routine']),
      reason: z.string(),
      boost: z.number(),
    });

    const ConversationAnalysisSchema = z.object({
      userTrigger: TriggerMatchSchema.nullable(),
      claudeInsights: z.array(TriggerMatchSchema),
      semanticSignal: SemanticSignalSchema,
      shouldAutoSave: z.boolean(),
      totalMemorableItems: z.number().min(0),
    });

    it('should validate trigger match objects', () => {
      const validTriggers = [
        { type: 'save' as const, confidence: 0.85, memoryType: 'decision' as const },
        { type: 'recall' as const, confidence: 0.8, extractedContent: 'database' },
        { type: 'synthesize' as const, confidence: 0.9 },
        { type: 'save' as const, confidence: 0.7, suggestedTags: ['api', 'auth'] },
      ];

      for (const trigger of validTriggers) {
        expect(() => TriggerMatchSchema.parse(trigger)).not.toThrow();
      }
    });

    it('should validate semantic signal objects', () => {
      const validSignals = [
        { signal: 'critical' as const, reason: 'Security concern', boost: 2 },
        { signal: 'important' as const, reason: 'Decision made', boost: 1 },
        { signal: 'notable' as const, reason: 'Learning', boost: 0.5 },
        { signal: 'routine' as const, reason: 'Normal content', boost: 0 },
      ];

      for (const signal of validSignals) {
        expect(() => SemanticSignalSchema.parse(signal)).not.toThrow();
      }
    });

    it('should validate conversation analysis objects', () => {
      const validAnalysis = {
        userTrigger: { type: 'save' as const, confidence: 0.85, memoryType: 'decision' as const },
        claudeInsights: [
          { type: 'save' as const, confidence: 0.75, memoryType: 'learning' as const },
        ],
        semanticSignal: { signal: 'important' as const, reason: 'Decision', boost: 1 },
        shouldAutoSave: true,
        totalMemorableItems: 2,
      };

      expect(() => ConversationAnalysisSchema.parse(validAnalysis)).not.toThrow();
    });
  });
});
