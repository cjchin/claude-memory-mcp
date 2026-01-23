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
