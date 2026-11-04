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

