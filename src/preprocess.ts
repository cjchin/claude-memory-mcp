/**
 * Preprocessing Module
 * 
 * Cleans and structures raw input before embedding.
 * Goal: Better semantic signal, consistent format, temporal awareness.
 */

export interface PreprocessedMemory {
  // Core content
  statement: string;           // Clean, structured main content
  reasoning?: string;          // Why this matters/was decided
  context?: string;            // Situational context
  
  // Temporal data
  timestamp: number;           // When this memory was created
  validFrom?: number;          // When this truth became true
  validUntil?: number;         // When superseded (null = current)
  supersedes?: string;         // ID of memory this updates
  
  // Extracted metadata
  entities: string[];          // Named entities (tech, people, concepts)
  keywords: string[];          // Searchable terms
  
  // Classification
  memoryType: string;          // decision, learning, pattern, etc.
  layer: 'foundational' | 'long-term' | 'working';
  
  // For embedding
  embeddingText: string;       // Optimized text for vector generation
}

/**
 * Filler words and phrases to remove
 */
const FILLER_PATTERNS = [
  /\b(um|uh|like|you know|basically|actually|literally|just|so|well|anyway)\b/gi,
  /\b(i mean|i think|i guess|kind of|sort of|in a way)\b/gi,
  /\s+/g, // Normalize whitespace
];

/**
 * Clean raw text by removing filler and normalizing
 */
export function cleanText(raw: string): string {
  let cleaned = raw;
  
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, pattern.source.includes('\\s') ? ' ' : '');
  }
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Fix common issues
  cleaned = cleaned
    .replace(/\s+([.,!?])/g, '$1')  // Remove space before punctuation
    .replace(/([.,!?])(\w)/g, '$1 $2');  // Add space after punctuation
  
  return cleaned;
}

/**
 * Extract named entities (technologies, concepts, etc.)
 */
export function extractEntities(text: string): string[] {
  const entities: Set<string> = new Set();
  const lower = text.toLowerCase();
  
  // Technology patterns
  const techPatterns: Record<string, RegExp> = {
    'PostgreSQL': /\b(postgres|postgresql|psql)\b/i,
    'MongoDB': /\b(mongo|mongodb)\b/i,
    'TypeScript': /\b(typescript|ts)\b/i,
    'JavaScript': /\b(javascript|js)\b/i,
    'Python': /\b(python|py)\b/i,
    'React': /\breact\b/i,
    'Node.js': /\b(node|nodejs|node\.js)\b/i,
    'Docker': /\bdocker\b/i,
    'Kubernetes': /\b(kubernetes|k8s)\b/i,
    'AWS': /\b(aws|amazon web services)\b/i,
    'GraphQL': /\bgraphql\b/i,
    'REST': /\brest\b/i,
    'API': /\bapi\b/i,
    'Git': /\bgit\b/i,
    'CI/CD': /\b(ci\/cd|cicd|continuous integration)\b/i,
    'JWT': /\bjwt\b/i,
    'OAuth': /\boauth\b/i,
    'SQL': /\bsql\b/i,
    'Redis': /\bredis\b/i,
    'Elasticsearch': /\b(elasticsearch|elastic)\b/i,
    'ChromaDB': /\b(chromadb|chroma)\b/i,
    'MCP': /\bmcp\b/i,
    'RAG': /\brag\b/i,
  };
  
  for (const [name, pattern] of Object.entries(techPatterns)) {
    if (pattern.test(text)) {
      entities.add(name);
    }
  }
  
  // Capitalize proper nouns (simple heuristic)
  const words = text.split(/\s+/);
  for (const word of words) {
    if (word.length > 2 && /^[A-Z][a-z]+$/.test(word) && !['The', 'This', 'That', 'When', 'Where', 'What', 'How', 'Why'].includes(word)) {
      entities.add(word);
    }
  }
  
  return Array.from(entities);
}

/**
 * Extract reasoning phrases
 */
export function extractReasoning(text: string): string | undefined {
  const reasoningPatterns = [
    /because\s+(.+?)(?:\.|$)/i,
    /since\s+(.+?)(?:\.|$)/i,
    /due to\s+(.+?)(?:\.|$)/i,
    /the reason (?:is|was)\s+(.+?)(?:\.|$)/i,
    /this (?:is|was) (?:because|since|due to)\s+(.+?)(?:\.|$)/i,
  ];
  
  for (const pattern of reasoningPatterns) {
    const match = text.match(pattern);
    if (match) {
      return cleanText(match[1]);
    }
  }
  
  return undefined;
}

/**
 * Extract core statement (remove reasoning clauses)
 */
export function extractCoreStatement(text: string): string {
  let statement = text;
  
  // Remove reasoning clauses for cleaner core statement
  statement = statement
    .replace(/\s+because\s+.+$/i, '')
    .replace(/\s+since\s+.+$/i, '')
    .replace(/\s+due to\s+.+$/i, '');
  
  return cleanText(statement);
}

/**
 * Generate optimized text for embedding
 */
export function generateEmbeddingText(memory: Partial<PreprocessedMemory>): string {
  const parts: string[] = [];
  
  if (memory.statement) {
    parts.push(memory.statement);
  }
  
  if (memory.reasoning) {
    parts.push(`Reason: ${memory.reasoning}`);
  }
  
  if (memory.context) {
    parts.push(`Context: ${memory.context}`);
  }
  
  if (memory.entities && memory.entities.length > 0) {
    parts.push(`Topics: ${memory.entities.join(', ')}`);
  }
  
  return parts.join('. ');
}

/**
 * Full preprocessing pipeline
 */
export function preprocess(
  raw: string, 
  options: {
    context?: string;
    layer?: PreprocessedMemory['layer'];
    validFrom?: number;
    supersedes?: string;
  } = {}
): PreprocessedMemory {
  const cleaned = cleanText(raw);
  const statement = extractCoreStatement(cleaned);
  const reasoning = extractReasoning(cleaned);
  const entities = extractEntities(cleaned);
  
  // Import from intelligence.ts would create circular dep, so inline simple version
  const keywords = cleaned
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3)
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 10);
  
  const memory: PreprocessedMemory = {
    statement,
    reasoning,
    context: options.context,
    timestamp: Date.now(),
    validFrom: options.validFrom || Date.now(),
    validUntil: undefined,
    supersedes: options.supersedes,
    entities,
    keywords,
    memoryType: 'context', // Will be overridden by intelligence.ts
    layer: options.layer || 'long-term',
    embeddingText: '', // Set below
  };
  
  memory.embeddingText = generateEmbeddingText(memory);
  
  return memory;
}

/**
 * Preprocess for foundational memories (goals, identity, values)
 */
export function preprocessFoundational(
  raw: string,
  category: 'identity' | 'goal' | 'value' | 'constraint'
): PreprocessedMemory {
  const memory = preprocess(raw, { layer: 'foundational' });
  
  // Foundational memories get special treatment
  memory.memoryType = category;
  memory.context = `Foundational ${category}`;
  
  // Regenerate embedding text with category marker
  memory.embeddingText = `[${category.toUpperCase()}] ${memory.embeddingText}`;
  
  return memory;
}
