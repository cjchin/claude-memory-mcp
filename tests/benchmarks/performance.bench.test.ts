/**
 * Performance Benchmark Tests
 * 
 * Measures and tracks performance of critical operations:
 * - Embedding generation
 * - Semantic search
 * - Trigger detection
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { embed, embedBatch } from '../../src/embeddings.js';
import { detectTrigger, detectClaudeInsights, analyzeConversationTurn } from '../../src/autonomous.js';
import { detectMemoryType, detectTags, estimateImportance } from '../../src/intelligence.js';
import { ChromaClient, IncludeEnum } from 'chromadb';

// Performance thresholds (ms) - generous for cold starts
const THRESHOLDS = {
  singleEmbed: 5000,      // First embedding can be slow (model loading)
  batchEmbed10: 5000,     // 10 embeddings should be < 5s
  triggerDetection: 50,   // Trigger detection should be < 50ms
  intelligenceStack: 75,  // Full intelligence analysis < 75ms
  chromaSearch: 200,      // ChromaDB search should be < 200ms
};

describe('Performance Benchmarks', () => {
  describe('Embedding Generation', () => {
    it('should generate single embedding within threshold', async () => {
      const text = 'We decided to use TypeScript for type safety and better developer experience';
      
      const start = performance.now();
      const embedding = await embed(text);
      const duration = performance.now() - start;

      expect(embedding).toHaveLength(384);
      expect(duration).toBeLessThan(THRESHOLDS.singleEmbed);
      
      console.log(`  📊 Single embed: ${duration.toFixed(2)}ms (threshold: ${THRESHOLDS.singleEmbed}ms)`);
    });

    it('should handle batch embeddings efficiently', async () => {
      const texts = Array(10).fill(null).map((_, i) => 
        `Memory ${i}: This is a test document about software development topic ${i}`
      );

      const start = performance.now();
      const embeddings = await embedBatch(texts);
      const duration = performance.now() - start;

      expect(embeddings).toHaveLength(10);
      expect(embeddings.every(e => e.length === 384)).toBe(true);
      expect(duration).toBeLessThan(THRESHOLDS.batchEmbed10);

      console.log(`  📊 Batch embed (10): ${duration.toFixed(2)}ms (threshold: ${THRESHOLDS.batchEmbed10}ms)`);
      console.log(`  📊 Per-item average: ${(duration / 10).toFixed(2)}ms`);
    });

    it('should measure embedding throughput', async () => {
      const iterations = 5;
      const texts = [
        'Short text',
        'Medium length text with some more content about programming',
        'A longer piece of text that contains multiple sentences. This simulates a more realistic memory that might be stored. It includes details about decisions and patterns.',
      ];

      const results: { length: number; avgTime: number }[] = [];

      for (const text of texts) {
        const times: number[] = [];
        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          await embed(text);
          times.push(performance.now() - start);
        }
        const avgTime = times.slice(1).reduce((a, b) => a + b, 0) / (iterations - 1); // Skip first (cold)
        results.push({ length: text.length, avgTime });
      }

      console.log('  📊 Embedding throughput by text length:');
      for (const r of results) {
        console.log(`     ${r.length} chars: ${r.avgTime.toFixed(2)}ms avg`);
      }
    });
  });

  describe('Trigger Detection', () => {
    it('should detect triggers within threshold', () => {
      const messages = [
        'We decided to use PostgreSQL',
        'What did we decide about authentication?',
        'Synthesize this session',
        'I learned that async/await is better',
        'Just a normal message with no triggers',
      ];

      const times: number[] = [];

      for (const msg of messages) {
        const start = performance.now();
        detectTrigger(msg);
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(THRESHOLDS.triggerDetection);

      console.log(`  📊 Trigger detection avg: ${avgTime.toFixed(3)}ms (threshold: ${THRESHOLDS.triggerDetection}ms)`);
    });

    it('should detect Claude insights efficiently', () => {
      const responses = [
        'I recommend using TypeScript for this project because it provides better type safety.',
        'I found that the issue is with the async handling. The solution is to use proper error boundaries.',
        'The best approach is to implement caching at the service layer.',
      ];

      const times: number[] = [];

      for (const resp of responses) {
        const start = performance.now();
        detectClaudeInsights(resp);
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(THRESHOLDS.triggerDetection * 2);

      console.log(`  📊 Claude insights detection avg: ${avgTime.toFixed(3)}ms`);
    });

    it('should analyze conversation turns efficiently', () => {
      const exchanges = [
        { user: 'We decided to use monorepo', claude: 'I recommend Turborepo for the build system' },
        { user: 'What about testing?', claude: 'I suggest using Vitest with coverage' },
        { user: 'Found a security issue', claude: 'This is critical. The solution is to sanitize inputs.' },
      ];

      const times: number[] = [];

      for (const { user, claude } of exchanges) {
        const start = performance.now();
        analyzeConversationTurn(user, claude);
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`  📊 Full conversation analysis avg: ${avgTime.toFixed(3)}ms`);
    });
  });

  describe('Intelligence Stack', () => {
    it('should run full intelligence stack within threshold', () => {
      const content = 'We decided to implement authentication using JWT tokens with refresh token rotation for security';

      const start = performance.now();
      const type = detectMemoryType(content);
      const tags = detectTags(content);
      const importance = estimateImportance(content);
      const duration = performance.now() - start;

      expect(type).toBeDefined();
      expect(tags).toBeInstanceOf(Array);
      expect(importance).toBeGreaterThanOrEqual(1);
      expect(duration).toBeLessThan(THRESHOLDS.intelligenceStack);

      console.log(`  📊 Intelligence stack: ${duration.toFixed(3)}ms (threshold: ${THRESHOLDS.intelligenceStack}ms)`);
    });

    it('should measure individual intelligence functions', () => {
      const content = 'The pattern is to always validate inputs at API boundaries using Zod schemas';
      
      const measurements: Record<string, number> = {};

      let start = performance.now();
      detectMemoryType(content);
      measurements['detectMemoryType'] = performance.now() - start;

      start = performance.now();
      detectTags(content);
      measurements['detectTags'] = performance.now() - start;

      start = performance.now();
      estimateImportance(content);
      measurements['estimateImportance'] = performance.now() - start;

      console.log('  📊 Intelligence function breakdown:');
      for (const [fn, time] of Object.entries(measurements)) {
        console.log(`     ${fn}: ${time.toFixed(3)}ms`);
      }
    });
  });

  describe('ChromaDB Operations', () => {
    let client: ChromaClient | null = null;
    let isAvailable = false;

    beforeAll(async () => {
      try {
        client = new ChromaClient({ path: 'http://localhost:8000' });
        await client.heartbeat();
        isAvailable = true;
      } catch {
        isAvailable = false;
      }
    });

    it('should perform search within threshold', async () => {
      if (!isAvailable) {
        console.log('  ⚠️  ChromaDB not available - skipping search benchmark');
        return;
      }

      const collectionName = 'perf_test_' + Date.now();
      const collection = await client!.getOrCreateCollection({ name: collectionName });

      // Add test data
      const testData = Array(50).fill(null).map((_, i) => ({
        id: `doc_${i}`,
        content: `Test document ${i} about ${['TypeScript', 'React', 'PostgreSQL', 'Docker', 'Testing'][i % 5]}`,
      }));

      const embeddings = await embedBatch(testData.map(d => d.content));
      
      await collection.add({
        ids: testData.map(d => d.id),
        documents: testData.map(d => d.content),
        embeddings,
        metadatas: testData.map((_, i) => ({ index: i })),
      });

      // Benchmark search
      const queryEmbedding = await embed('TypeScript type safety');
      
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: 5,
          include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
        });
        times.push(performance.now() - start);
      }

      const avgTime = times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1);
      expect(avgTime).toBeLessThan(THRESHOLDS.chromaSearch);

      console.log(`  📊 ChromaDB search (50 docs): ${avgTime.toFixed(2)}ms avg (threshold: ${THRESHOLDS.chromaSearch}ms)`);

      // Cleanup
      await client!.deleteCollection({ name: collectionName });
    });

    it('should measure insertion throughput', async () => {
      if (!isAvailable) return;

      const collectionName = 'perf_insert_' + Date.now();
      const collection = await client!.getOrCreateCollection({ name: collectionName });

      const batchSizes = [1, 10, 25];
      
      console.log('  📊 Insertion throughput:');
      
      for (const batchSize of batchSizes) {
        const docs = Array(batchSize).fill(null).map((_, i) => ({
          id: `insert_${Date.now()}_${i}`,
          content: `Test document for insertion benchmark ${i}`,
        }));

        const embeddings = await embedBatch(docs.map(d => d.content));

        const start = performance.now();
        await collection.add({
          ids: docs.map(d => d.id),
          documents: docs.map(d => d.content),
          embeddings,
          metadatas: docs.map(() => ({ test: true })),
        });
        const duration = performance.now() - start;

        console.log(`     Batch of ${batchSize}: ${duration.toFixed(2)}ms (${(duration / batchSize).toFixed(2)}ms/doc)`);
      }

      // Cleanup
      await client!.deleteCollection({ name: collectionName });
    });
  });
});
