/**
 * Real ChromaDB Integration Tests
 * 
 * These tests run against an actual ChromaDB instance.
 * Prerequisites: ChromaDB running at localhost:8000
 * 
 * Run with: npm run test:integration
 * Skip if no ChromaDB: Tests will skip gracefully
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ChromaClient } from 'chromadb';

// Test collection name to avoid polluting real data
const TEST_COLLECTION = 'test_memories_' + Date.now();

let client: ChromaClient | null = null;
let isChromaAvailable = false;

// Check if ChromaDB is available
async function checkChromaConnection(): Promise<boolean> {
  try {
    const testClient = new ChromaClient({ path: 'http://localhost:8000' });
    await testClient.heartbeat();
    return true;
  } catch {
    return false;
  }
}

describe('Real ChromaDB Integration', () => {
  beforeAll(async () => {
    isChromaAvailable = await checkChromaConnection();
    if (isChromaAvailable) {
      client = new ChromaClient({ path: 'http://localhost:8000' });
    }
  });

  afterAll(async () => {
    // Cleanup test collection
    if (client && isChromaAvailable) {
      try {
        await client.deleteCollection({ name: TEST_COLLECTION });
      } catch {
        // Collection may not exist
      }
    }
  });

  describe('ChromaDB Connection', () => {
    it('should connect to ChromaDB (skip if unavailable)', async () => {
      if (!isChromaAvailable) {
        console.log('⚠️  ChromaDB not available - skipping real integration tests');
        console.log('   Start ChromaDB with: .\\start-chroma.ps1');
        return;
      }
      
      const heartbeat = await client!.heartbeat();
      expect(heartbeat).toBeDefined();
    });
  });

  describe('Collection Operations', () => {
    it('should create and delete collections', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({
        name: TEST_COLLECTION,
        metadata: { description: 'Test collection' },
      });
      
      expect(collection.name).toBe(TEST_COLLECTION);
      
      // Verify it exists by trying to get it (listCollections API varies by version)
      const retrieved = await client!.getCollection({ name: TEST_COLLECTION });
      expect(retrieved.name).toBe(TEST_COLLECTION);
    });
  });

  describe('Document CRUD', () => {
    it('should add and retrieve documents', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Add a document
      await collection.add({
        ids: ['test_doc_1'],
        documents: ['This is a test document about TypeScript'],
        metadatas: [{ type: 'test', importance: 3 }],
        embeddings: [[0.1, 0.2, 0.3, ...Array(381).fill(0)]], // 384-dim mock
      });
      
      // Retrieve it
      const result = await collection.get({ ids: ['test_doc_1'] });
      
      expect(result.ids).toContain('test_doc_1');
      expect(result.documents?.[0]).toContain('TypeScript');
      expect(result.metadatas?.[0]?.type).toBe('test');
    });

    it('should update documents', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Update the document
      await collection.update({
        ids: ['test_doc_1'],
        metadatas: [{ type: 'test', importance: 5, updated: 'true' }],
      });
      
      // Verify update
      const result = await collection.get({ ids: ['test_doc_1'] });
      expect(result.metadatas?.[0]?.importance).toBe(5);
      expect(result.metadatas?.[0]?.updated).toBe('true');
    });

    it('should delete documents', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Delete the document
      await collection.delete({ ids: ['test_doc_1'] });
      
      // Verify deletion
      const result = await collection.get({ ids: ['test_doc_1'] });
      expect(result.ids.length).toBe(0);
    });
  });

  describe('Semantic Search', () => {
    beforeEach(async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Clear and add test data
      try {
        await collection.delete({ ids: ['search_1', 'search_2', 'search_3'] });
      } catch { /* ignore */ }
      
      // Create distinguishable mock embeddings
      const embed1 = [1.0, 0.0, 0.0, ...Array(381).fill(0)];
      const embed2 = [0.0, 1.0, 0.0, ...Array(381).fill(0)];
      const embed3 = [0.9, 0.1, 0.0, ...Array(381).fill(0)]; // Similar to embed1
      
      await collection.add({
        ids: ['search_1', 'search_2', 'search_3'],
        documents: [
          'TypeScript is great for type safety',
          'Python is good for data science',
          'TypeScript helps catch errors early',
        ],
        metadatas: [
          { type: 'learning', language: 'typescript' },
          { type: 'learning', language: 'python' },
          { type: 'learning', language: 'typescript' },
        ],
        embeddings: [embed1, embed2, embed3],
      });
    });

    it('should find similar documents by embedding', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Query with embedding similar to embed1
      const queryEmbedding = [0.95, 0.05, 0.0, ...Array(381).fill(0)];
      
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 2,
      });
      
      // Should return search_1 and search_3 (both TypeScript related)
      expect(results.ids[0]).toContain('search_1');
      expect(results.ids[0]).toContain('search_3');
    });

    it('should filter by metadata', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      const results = await collection.query({
        queryEmbeddings: [[0.5, 0.5, 0.0, ...Array(381).fill(0)]],
        nResults: 10,
        where: { language: 'python' },
      });
      
      expect(results.ids[0].length).toBe(1);
      expect(results.ids[0]).toContain('search_2');
    });
  });

  describe('Metadata Handling', () => {
    it('should handle comma-separated tags (our convention)', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      // Our tag convention: store as comma-separated string
      const tags = ['architecture', 'database', 'performance'];
      const tagsString = tags.join(',');
      
      await collection.add({
        ids: ['tags_test'],
        documents: ['Test document with tags'],
        metadatas: [{ tags: tagsString }],
        embeddings: [[...Array(384).fill(0.1)]],
      });
      
      const result = await collection.get({ ids: ['tags_test'] });
      const retrievedTags = (result.metadatas?.[0]?.tags as string).split(',');
      
      expect(retrievedTags).toEqual(tags);
      
      // Cleanup
      await collection.delete({ ids: ['tags_test'] });
    });

    it('should handle JSON metadata', async () => {
      if (!isChromaAvailable) return;
      
      const collection = await client!.getOrCreateCollection({ name: TEST_COLLECTION });
      
      const complexMetadata = {
        nested: { key: 'value' },
        array: [1, 2, 3],
      };
      
      await collection.add({
        ids: ['json_test'],
        documents: ['Test document with JSON metadata'],
        metadatas: [{ metadata_json: JSON.stringify(complexMetadata) }],
        embeddings: [[...Array(384).fill(0.2)]],
      });
      
      const result = await collection.get({ ids: ['json_test'] });
      const retrieved = JSON.parse(result.metadatas?.[0]?.metadata_json as string);
      
      expect(retrieved).toEqual(complexMetadata);
      
      // Cleanup
      await collection.delete({ ids: ['json_test'] });
    });
  });
});
