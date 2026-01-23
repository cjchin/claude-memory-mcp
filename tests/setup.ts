/**
 * Global test setup
 * Runs before all test files
 */

import { vi } from 'vitest';

// Mock console.error to suppress noisy logs during tests
// (MCP server logs to stderr)
vi.spyOn(console, 'error').mockImplementation(() => {});

// Set test environment variables
process.env.NODE_ENV = 'test';

// Global teardown
afterAll(() => {
  vi.restoreAllMocks();
});
