/**
 * End-to-End Memory Flow Tests
 * 
 * Tests complete memory lifecycle with real ChromaDB:
 * remember → recall → update → forget
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ChromaClient, IncludeEnum } from 'chromadb';
import { embed } from '../../src/embeddings.js';
import { detectMemoryType, detectTags, estimateImportance } from '../../src/intelligence.js';
import { analyzeConversationTurn, detectClaudeInsights } from '../../src/autonomous.js';

const TEST_COLLECTION = 'e2e_test_memories_' + Date.now();

let client: ChromaClient | null = null;
let isChromaAvailable = false;

async function checkChromaConnection(): Promise<boolean> {
  try {
    const testClient = new ChromaClient({ path: 'http://localhost:8000' });
    await testClient.heartbeat();
    return true;
  } catch {
    return false;
  }
}

describe('E2E Memory Flow', () => {
  beforeAll(async () => {
    isChromaAvailable = await checkChromaConnection();
    if (isChromaAvailable) {
      client = new ChromaClient({ path: 'http://localhost:8000' });
    }
  });

  afterAll(async () => {
    if (client && isChromaAvailable) {
      try {
        await client.deleteCollection({ name: TEST_COLLECTION });
      } catch { /* ignore */ }
    }
  });

  describe('Complete Memory Lifecycle', () => {
    it('should perform full remember → recall → update → forget cycle', async () => {
      if (!isChromaAvailable) {
        console.log('⚠️  ChromaDB not available - skipping E2E tests');
        return;
      }

      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });

      // === REMEMBER ===
      const content = 'We decided to use PostgreSQL because it has better JSON support than MySQL';
      const memoryId = `mem_${Date.now()}`;
      
      // Generate embedding
      const embedding = await embed(content);
      expect(embedding).toHaveLength(384);

      // Auto-detect metadata
      const type = detectMemoryType(content);
      const tags = detectTags(content);
      const importance = estimateImportance(content);

      expect(type).toBe('decision');
      expect(tags).toContain('database');
      expect(importance).toBeGreaterThanOrEqual(3);

      // Store in ChromaDB
      await collection.add({
        ids: [memoryId],
        documents: [content],
        embeddings: [embedding],
        metadatas: [{
          type,
          tags: tags.join(','),
          importance,
          created_at: Date.now().toString(),
        }],
      });

      // === RECALL ===
      const query = 'What database did we choose?';
      const queryEmbedding = await embed(query);

      const searchResults = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 5,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
      });

      expect(searchResults.ids[0]).toContain(memoryId);
      expect(searchResults.documents![0]![0]).toContain('PostgreSQL');
      // ChromaDB L2 distance - lower is more similar, but can exceed 1.0
      expect(searchResults.distances![0]![0]).toBeLessThan(2.0);

      // === UPDATE ===
      await collection.update({
        ids: [memoryId],
        metadatas: [{
          type,
          tags: [...tags, 'updated'].join(','),
          importance: importance + 1,
          created_at: Date.now().toString(),
          updated_at: Date.now().toString(),
        }],
      });

      const updated = await collection.get({
        ids: [memoryId],
        include: [IncludeEnum.Metadatas],
      });

      expect(updated.metadatas![0]!.importance).toBe(importance + 1);
      expect((updated.metadatas![0]!.tags as string).split(',')).toContain('updated');

      // === FORGET ===
      await collection.delete({ ids: [memoryId] });

      const deleted = await collection.get({ ids: [memoryId] });
      expect(deleted.ids.length).toBe(0);
    });

    it('should support semantic search across multiple memories', async () => {
      if (!isChromaAvailable) return;

      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });

      const memories = [
        { content: 'TypeScript provides better type safety than JavaScript', id: 'ts_1' },
        { content: 'We use ESLint with strict rules for code quality', id: 'lint_1' },
        { content: 'PostgreSQL handles complex queries better than MongoDB', id: 'db_1' },
        { content: 'React hooks are preferred over class components', id: 'react_1' },
        { content: 'Always use async/await instead of callbacks', id: 'async_1' },
      ];

      // Add all memories
      for (const mem of memories) {
        const embedding = await embed(mem.content);
        await collection.add({
          ids: [mem.id],
          documents: [mem.content],
          embeddings: [embedding],
          metadatas: [{
            type: detectMemoryType(mem.content),
            tags: detectTags(mem.content).join(','),
            importance: estimateImportance(mem.content),
          }],
        });
      }

      // Search for type-safety related memories
      const query = 'How do we ensure code quality and safety?';
      const queryEmbedding = await embed(query);

      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 3,
        include: [IncludeEnum.Documents, IncludeEnum.Distances],
      });

      // Should find TypeScript and ESLint memories as most relevant
      const foundDocs = results.documents![0]!;
      const hasTypeSafety = foundDocs.some(d => d?.includes('TypeScript') || d?.includes('ESLint'));
      expect(hasTypeSafety).toBe(true);

      // Cleanup
      await collection.delete({ ids: memories.map(m => m.id) });
    });

    it('should handle conversation-driven memory creation', async () => {
      if (!isChromaAvailable) return;

      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });

      // Simulate a conversation turn
      const userMessage = 'How should we handle authentication?';
      const claudeResponse = 'I recommend using JWT tokens with refresh token rotation. The solution is to implement a middleware that validates tokens on each request.';

      const analysis = analyzeConversationTurn(userMessage, claudeResponse);

      expect(analysis.shouldAutoSave).toBe(true);
      expect(analysis.claudeInsights.length).toBeGreaterThan(0);
      expect(analysis.totalMemorableItems).toBeGreaterThan(0);

      // Save Claude's insights as memories
      for (const insight of analysis.claudeInsights) {
        if (insight.extractedContent) {
          const memId = `insight_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const embedding = await embed(insight.extractedContent);

          await collection.add({
            ids: [memId],
            documents: [insight.extractedContent],
            embeddings: [embedding],
            metadatas: [{
              type: insight.memoryType || 'learning',
              tags: (insight.suggestedTags || []).join(','),
              importance: Math.round(insight.confidence * 5),
              source: 'claude_insight',
            }],
          });
        }
      }

      // Verify we can recall the insight
      const recallQuery = 'authentication recommendations';
      const queryEmbed = await embed(recallQuery);
      const recalled = await collection.query({
        queryEmbeddings: [queryEmbed],
        nResults: 3,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
      });

      expect(recalled.ids[0]!.length).toBeGreaterThan(0);
      
      // Cleanup
      await collection.delete({ 
        where: { source: 'claude_insight' } 
      });
    });
  });

  describe('Bidirectional Trigger Integration', () => {
    it('should detect and save from both user and Claude', async () => {
      if (!isChromaAvailable) return;

      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });

      const exchanges = [
        {
          user: 'We decided to use a monorepo with Turborepo',
          claude: 'Good choice. I recommend structuring packages with shared configs at the root.',
        },
        {
          user: 'What about CI/CD?',
          claude: 'I suggest using GitHub Actions. The best approach is to cache dependencies between runs.',
        },
        {
          user: 'Found an issue with the build',
          claude: 'I discovered the problem is with circular dependencies. The solution is to use barrel files carefully.',
        },
      ];

      const allMemoryIds: string[] = [];

      for (const exchange of exchanges) {
        const analysis = analyzeConversationTurn(exchange.user, exchange.claude);

        // Save user trigger if detected
        if (analysis.userTrigger && analysis.userTrigger.extractedContent) {
          const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          allMemoryIds.push(id);
          await collection.add({
            ids: [id],
            documents: [analysis.userTrigger.extractedContent],
            embeddings: [await embed(analysis.userTrigger.extractedContent)],
            metadatas: [{
              type: analysis.userTrigger.memoryType || 'context',
              source: 'user',
              confidence: analysis.userTrigger.confidence,
            }],
          });
        }

        // Save Claude insights
        for (const insight of analysis.claudeInsights) {
          if (insight.extractedContent) {
            const id = `claude_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            allMemoryIds.push(id);
            await collection.add({
              ids: [id],
              documents: [insight.extractedContent],
              embeddings: [await embed(insight.extractedContent)],
              metadatas: [{
                type: insight.memoryType || 'learning',
                source: 'claude',
                confidence: insight.confidence,
              }],
            });
          }
        }
      }

      // Verify we captured insights from both sides
      const userMemories = await collection.get({
        where: { source: 'user' },
        include: [IncludeEnum.Documents],
      });

      const claudeMemories = await collection.get({
        where: { source: 'claude' },
        include: [IncludeEnum.Documents],
      });

      expect(userMemories.ids.length).toBeGreaterThan(0);
      expect(claudeMemories.ids.length).toBeGreaterThan(0);

      // Semantic search should find relevant memories
      const query = 'monorepo and build setup';
      const results = await collection.query({
        queryEmbeddings: [await embed(query)],
        nResults: 5,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
      });

      expect(results.ids[0]!.length).toBeGreaterThan(0);

      // Cleanup
      await collection.delete({ ids: allMemoryIds });
    });
  });
});
