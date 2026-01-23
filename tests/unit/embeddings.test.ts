/**
 * Unit tests for embeddings.ts
 * Tests the embedding generation functionality
 * 
 * Note: These tests use the real model for integration testing.
 * For faster unit tests, use mocked embeddings.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initEmbeddings, embed, embedBatch } from '../../src/embeddings.js';
import { createMockEmbedding, assertEmbeddingsSimilar } from '../utils.js';

describe('embeddings.ts', () => {
  // Initialize the real model once for all tests
  // This is slow (~5s) but ensures the real pipeline works
  beforeAll(async () => {
    await initEmbeddings();
  }, 60000); // 60s timeout for model download

  describe('embed', () => {
    it('should generate embeddings of correct dimension', async () => {
      const embedding = await embed("test content");
      
      // all-MiniLM-L6-v2 produces 384-dimensional embeddings
      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(384);
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await embed("test content");
      
      // L2 norm should be approximately 1
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 2);
    });

    it('should generate similar embeddings for similar text', async () => {
      const embedding1 = await embed("The cat sat on the mat");
      const embedding2 = await embed("A cat is sitting on a mat");
      
      // Calculate cosine similarity
      const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
      
      // Similar sentences should have high similarity
      expect(dotProduct).toBeGreaterThan(0.7);
    });

    it('should generate different embeddings for different text', async () => {
      const embedding1 = await embed("TypeScript programming language");
      const embedding2 = await embed("Cooking Italian pasta");
      
      // Calculate cosine similarity
      const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
      
      // Unrelated sentences should have lower similarity
      expect(dotProduct).toBeLessThan(0.5);
    });

    it('should handle empty string', async () => {
      const embedding = await embed("");
      expect(embedding.length).toBe(384);
    });

    it('should handle long text', async () => {
      const longText = "This is a test sentence. ".repeat(100);
      const embedding = await embed(longText);
      
      expect(embedding.length).toBe(384);
      // Should still be normalized
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 2);
    });

    it('should handle special characters', async () => {
      const embedding = await embed("Special chars: @#$%^&*(){}[]|\\:\";<>?,./");
      expect(embedding.length).toBe(384);
    });

    it('should be deterministic (same input = same output)', async () => {
      const text = "deterministic test";
      const embedding1 = await embed(text);
      const embedding2 = await embed(text);
      
      // Should be exactly equal
      embedding1.forEach((val, i) => {
        expect(val).toBeCloseTo(embedding2[i], 10);
      });
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts in batch', async () => {
      const texts = [
        "First text about programming",
        "Second text about cooking",
        "Third text about music",
      ];
      
      const embeddings = await embedBatch(texts);
      
      expect(embeddings.length).toBe(3);
      embeddings.forEach(emb => {
        expect(emb.length).toBe(384);
      });
    });

    it('should return empty array for empty input', async () => {
      const embeddings = await embedBatch([]);
      expect(embeddings).toEqual([]);
    });

    it('should produce same results as individual embeds', async () => {
      const texts = ["test one", "test two"];
      
      const batchResults = await embedBatch(texts);
      const individualResults = await Promise.all(texts.map(t => embed(t)));
      
      batchResults.forEach((batch, i) => {
        batch.forEach((val, j) => {
          expect(val).toBeCloseTo(individualResults[i][j], 10);
        });
      });
    });
  });

  describe('mock embeddings (for faster tests)', () => {
    it('createMockEmbedding should be deterministic', () => {
      const emb1 = createMockEmbedding("test");
      const emb2 = createMockEmbedding("test");
      
      expect(emb1).toEqual(emb2);
    });

    it('createMockEmbedding should produce normalized vectors', () => {
      const emb = createMockEmbedding("test text");
      const magnitude = Math.sqrt(emb.reduce((sum, val) => sum + val * val, 0));
      
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('createMockEmbedding should produce different vectors for different text', () => {
      const emb1 = createMockEmbedding("hello");
      const emb2 = createMockEmbedding("world");
      
      expect(emb1).not.toEqual(emb2);
    });

    it('assertEmbeddingsSimilar should pass for identical embeddings', () => {
      const emb = createMockEmbedding("test");
      expect(() => assertEmbeddingsSimilar(emb, emb)).not.toThrow();
    });

    it('assertEmbeddingsSimilar should throw for dissimilar embeddings', () => {
      const emb1 = createMockEmbedding("hello world programming");
      const emb2 = createMockEmbedding("xyz123abc789");
      
      expect(() => assertEmbeddingsSimilar(emb1, emb2, 0.99)).toThrow();
    });
  });
});
