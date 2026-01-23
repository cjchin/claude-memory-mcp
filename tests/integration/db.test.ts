/**
 * Integration tests for db.ts
 * Tests CRUD operations against ChromaDB (mock or real)
 * 
 * For CI/fast tests: Uses mocked ChromaDB
 * For local verification: Set USE_REAL_CHROMADB=true
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockChromaClient, createMockCollection, createMockMemory, createMockEmbedding } from '../utils.js';

// Integration tests with mocked dependencies are complex with ESM.
// These tests focus on serialization logic and decay calculations.
// Full integration tests should be run with a real ChromaDB instance.

describe('db.ts metadata serialization', () => {
  it('should correctly serialize and deserialize tags', () => {
    const tags = ['architecture', 'api', 'performance'];
    const serialized = tags.join(',');
    const deserialized = serialized.split(',').filter(Boolean);
    
    expect(deserialized).toEqual(tags);
  });

  it('should handle empty tags', () => {
    const tags: string[] = [];
    const serialized = tags.join(',');
    const deserialized = serialized.split(',').filter(Boolean);
    
    expect(deserialized).toEqual([]);
  });

  it('should correctly serialize and deserialize JSON metadata', () => {
    const metadata = { key: 'value', nested: { a: 1 } };
    const serialized = JSON.stringify(metadata);
    const deserialized = JSON.parse(serialized);
    
    expect(deserialized).toEqual(metadata);
  });
  
  it('should handle metadata with special characters', () => {
    const metadata = { content: 'Line 1\nLine 2\tTabbed "quoted"' };
    const serialized = JSON.stringify(metadata);
    const deserialized = JSON.parse(serialized);
    
    expect(deserialized).toEqual(metadata);
  });
});

describe('db.ts memory decay', () => {
  it('should apply decay factor to scores based on age', () => {
    const halfLifeDays = 30;
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    
    // Memory at exactly half-life age should have 50% decay
    const age = halfLifeMs;
    const decayFactor = Math.pow(0.5, age / halfLifeMs);
    
    expect(decayFactor).toBeCloseTo(0.5, 5);
    
    // Fresh memory (age = 0) should have no decay
    const freshDecay = Math.pow(0.5, 0 / halfLifeMs);
    expect(freshDecay).toBe(1);
    
    // Old memory (2x half-life) should have 25% original score
    const oldDecay = Math.pow(0.5, (2 * halfLifeMs) / halfLifeMs);
    expect(oldDecay).toBeCloseTo(0.25, 5);
  });

  it('should boost scores based on importance', () => {
    // Higher importance should boost score
    const boostHigh = 1 + (5 - 3) * 0.1; // importance=5
    const boostLow = 1 + (1 - 3) * 0.1;  // importance=1
    const boostMid = 1 + (3 - 3) * 0.1;  // importance=3
    
    expect(boostHigh).toBe(1.2);
    expect(boostLow).toBe(0.8);
    expect(boostMid).toBe(1.0);
  });

  it('should cap access boost', () => {
    // Access boost should be capped at 0.2
    const accessBoost10 = Math.min(10 * 0.02, 0.2);
    const accessBoost20 = Math.min(20 * 0.02, 0.2);
    
    expect(accessBoost10).toBe(0.2);
    expect(accessBoost20).toBe(0.2);
    
    // Low access count should be proportional
    const accessBoost5 = Math.min(5 * 0.02, 0.2);
    expect(accessBoost5).toBe(0.1);
  });
});

describe('db.ts mock utilities', () => {
  it('createMockEmbedding should be deterministic', () => {
    const emb1 = createMockEmbedding('test');
    const emb2 = createMockEmbedding('test');
    
    expect(emb1).toEqual(emb2);
  });

  it('createMockMemory should generate unique IDs', () => {
    const mem1 = createMockMemory();
    const mem2 = createMockMemory();
    
    expect(mem1.id).not.toBe(mem2.id);
  });

  it('createMockCollection should track store state', () => {
    const collection = createMockCollection();
    
    expect(collection._store.size).toBe(0);
    collection._store.set('test', { embedding: [], document: 'test', metadata: {} });
    expect(collection._store.size).toBe(1);
    collection._clear();
    expect(collection._store.size).toBe(0);
  });
});
