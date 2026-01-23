/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  
  // Target specific files for mutation
  mutate: [
    'src/intelligence.ts',
    'src/autonomous.ts',
    'src/alignment.ts',
    // Exclude files with heavy external dependencies
    '!src/db.ts',
    '!src/embeddings.ts',
    '!src/index.ts',
    '!src/cli.ts',
  ],
  
  // Timeouts
  timeoutMS: 60000,
  timeoutFactor: 2.5,
  
  // Performance
  concurrency: 4,
  
  // Thresholds for quality gates
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  
  // Disable specific mutators that cause false positives
  mutator: {
    excludedMutations: [
      'StringLiteral', // String mutations often cause noise
    ],
  },
  
  // Vitest specific options
  vitest: {
    configFile: 'vitest.config.ts',
  },
};
