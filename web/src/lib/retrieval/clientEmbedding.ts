/**
 * Browser-side embedding generator using @xenova/transformers (all-MiniLM-L6-v2).
 * Runs completely in the browser via WebAssembly / ONNX, requiring zero API calls,
 * zero API keys, and zero serverless runtime memory.
 */

import { pipeline, env, FeatureExtractionPipeline } from "@xenova/transformers";

// Disable local model loading check; fetch quantized ONNX from HuggingFace CDN
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
let embeddingPipeline: FeatureExtractionPipeline | null = null;
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", MODEL_ID, {
      quantized: true,
    }) as Promise<FeatureExtractionPipeline>;
  }
  embeddingPipeline = await pipelinePromise;
  return embeddingPipeline;
}

/**
 * Generate 384-dimensional dense vector for a query in the browser.
 * Uses mean pooling and L2 normalization to exactly match fastembed sentence-transformers.
 */
export async function embedQueryClient(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate 384-dimensional dense vectors for a batch of text chunks in the browser.
 * Uses WebAssembly / ONNX client-side inference with progress reporting.
 */
export async function embedBatchClient(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  const extractor = await getEmbeddingPipeline();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const output = await extractor(texts[i], { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
    if (onProgress) {
      onProgress(i + 1, texts.length);
    }
  }
  return vectors;
}

