import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global test settings
    globals: true,
    
    // Test file patterns
    include: ['tests/**/*.test.ts'],
    
    // Exclude patterns
    exclude: ['node_modules', 'dist'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/index.ts'], // Entry points tested via integration
    },
    
    // Timeouts
    testTimeout: 30000, // 30s for embedding model tests
    hookTimeout: 60000, // 60s for setup (model loading)
    
    // Environment
    environment: 'node',
    
    // Setup files
    setupFiles: ['./tests/setup.ts'],
  },
  
  // ESM resolve settings
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
