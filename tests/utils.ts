/**
 * Test utilities and mocks for Claude Memory MCP
 */

import { vi } from 'vitest';
import type { Memory, MemoryType, Session } from '../src/types.js';

// ============ MOCK FACTORIES ============

/**
 * Create a mock Memory object with sensible defaults
 */
export function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    content: 'Test memory content',
    type: 'context',
    tags: [],
    timestamp: new Date().toISOString(),
    importance: 3,
    access_count: 0,
    ...overrides,
  };
}

/**
 * Create a mock Session object
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `sess_${Date.now()}`,
    started_at: new Date().toISOString(),
    memory_ids: [],
    ...overrides,
  };
}

// ============ CHROMADB MOCKS ============

/**
 * Mock ChromaDB Collection
 */
export function createMockCollection() {
  const store = new Map<string, { embedding: number[]; document: string; metadata: any }>();
  
  return {
    add: vi.fn(async ({ ids, embeddings, documents, metadatas }) => {
      ids.forEach((id: string, i: number) => {
        store.set(id, {
          embedding: embeddings[i],
          document: documents[i],
          metadata: metadatas[i],
        });
      });
    }),
    
    query: vi.fn(async ({ queryEmbeddings, nResults, where, include }) => {
      // Simple mock - return all stored items sorted by "distance"
      const items = Array.from(store.entries());
      const results = items.slice(0, nResults || 10);
      
      return {
        ids: [results.map(([id]) => id)],
        documents: [results.map(([_, data]) => data.document)],
        metadatas: [results.map(([_, data]) => data.metadata)],
        distances: [results.map((_, i) => 0.1 * i)], // Mock distances
      };
    }),
    
    get: vi.fn(async ({ ids }) => {
      const results = ids.map((id: string) => store.get(id)).filter(Boolean);
      return {
        ids: ids.filter((id: string) => store.has(id)),
        documents: results.map((r: any) => r?.document),
        metadatas: results.map((r: any) => r?.metadata),
      };
    }),
    
    update: vi.fn(async ({ ids, documents, metadatas }) => {
      ids.forEach((id: string, i: number) => {
        const existing = store.get(id);
        if (existing) {
          store.set(id, {
            ...existing,
            document: documents?.[i] ?? existing.document,
            metadata: metadatas?.[i] ?? existing.metadata,
          });
        }
      });
    }),
    
    delete: vi.fn(async ({ ids }) => {
      ids.forEach((id: string) => store.delete(id));
    }),
    
    count: vi.fn(async () => store.size),
    
    // Helper for tests
    _store: store,
    _clear: () => store.clear(),
  };
}

/**
 * Mock ChromaDB Client
 */
export function createMockChromaClient() {
  const collections = new Map<string, ReturnType<typeof createMockCollection>>();
  
  return {
    getOrCreateCollection: vi.fn(async ({ name }) => {
      if (!collections.has(name)) {
        collections.set(name, createMockCollection());
      }
      return collections.get(name)!;
    }),
    
    deleteCollection: vi.fn(async ({ name }) => {
      collections.delete(name);
    }),
    
    // Helper for tests
    _collections: collections,
  };
}

// ============ EMBEDDING MOCKS ============

/**
 * Create a deterministic mock embedding from text
 * Uses simple hash-based approach for reproducibility
 */
export function createMockEmbedding(text: string, dims: number = 384): number[] {
  const embedding = new Array(dims).fill(0);
  
  // Simple hash-based embedding (deterministic)
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    embedding[i % dims] += charCode / 1000;
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (magnitude || 1));
}

/**
 * Mock the embeddings module
 */
export function mockEmbeddings() {
  return {
    initEmbeddings: vi.fn(async () => {}),
    embed: vi.fn(async (text: string) => createMockEmbedding(text)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(t => createMockEmbedding(t))),
  };
}

// ============ TEST DATA FIXTURES ============

export const TEST_MEMORIES = {
  decision: {
    content: "We decided to use ChromaDB for vector storage because it has good TypeScript support and runs locally.",
    expectedType: 'decision' as MemoryType,
    expectedTags: ['database', 'architecture'],
  },
  learning: {
    content: "I learned that ChromaDB metadata doesn't support arrays, so we store tags as comma-separated strings.",
    expectedType: 'learning' as MemoryType,
    expectedTags: ['database'],
  },
  pattern: {
    content: "Convention: Always use .js extensions in imports for ESM compatibility, even for TypeScript files.",
    expectedType: 'pattern' as MemoryType,
    expectedTags: ['config'],
  },
  todo: {
    content: "TODO: Add rate limiting to prevent memory spam from autonomous triggers.",
    expectedType: 'todo' as MemoryType,
    expectedTags: ['feature'],
  },
  preference: {
    content: "I prefer using Vitest over Jest for TypeScript projects because of native ESM support.",
    expectedType: 'preference' as MemoryType,
    expectedTags: ['testing'],
  },
  reference: {
    content: "See the MCP protocol docs at https://modelcontextprotocol.io for tool schema reference.",
    expectedType: 'reference' as MemoryType,
    expectedTags: ['documentation'],
  },
  context: {
    content: "This project is an MCP server that provides persistent memory for Claude using RAG.",
    expectedType: 'context' as MemoryType,
    expectedTags: ['architecture'],
  },
};

export const TRIGGER_TEST_CASES = {
  saveDecision: [
    "We decided to use TypeScript for type safety",
    "The decision is to go with PostgreSQL",
    "After considering the options, we chose Redis for caching",
  ],
  saveLearning: [
    "I learned that async iterators don't work well here",
    "Turns out the API requires authentication",
    "The gotcha is that dates are stored as strings",
  ],
  savePattern: [
    "Going forward, we should always validate input",
    "The convention is to use camelCase for variables",
    "Best practice: always handle errors explicitly",
  ],
  noTrigger: [
    "Hello, how are you?",
    "Please review this code",
    "What do you think about this approach?",
  ],
};

// ============ ASSERTION HELPERS ============

/**
 * Assert that two embeddings are similar (cosine similarity > threshold)
 */
export function assertEmbeddingsSimilar(
  a: number[],
  b: number[],
  threshold: number = 0.8
): void {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimensions don't match: ${a.length} vs ${b.length}`);
  }
  
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  const similarity = dotProduct / (magnitudeA * magnitudeB);
  
  if (similarity < threshold) {
    throw new Error(`Embeddings not similar enough: ${similarity} < ${threshold}`);
  }
}

/**
 * Wait for a condition to be true (useful for async operations)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
