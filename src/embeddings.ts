import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

let embeddingPipeline: FeatureExtractionPipeline | null = null;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

export async function initEmbeddings(): Promise<void> {
  if (!embeddingPipeline) {
    console.error("Loading embedding model...");
    embeddingPipeline = await pipeline("feature-extraction", MODEL_NAME);
    console.error("Embedding model loaded.");
  }
}

export async function embed(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    await initEmbeddings();
  }

  const output = await embeddingPipeline!(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((text) => embed(text)));
}

/**
 * Calculate cosine similarity between two embedding vectors.
 * Returns value between -1 and 1, where 1 = identical, 0 = orthogonal, -1 = opposite.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}
