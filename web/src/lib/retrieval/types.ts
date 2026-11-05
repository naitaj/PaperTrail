/**
 * Retrieval types for PaperTrail (TRD §6, §8.4).
 */

export type RetrieverMode = "lexical" | "embedding" | "hybrid";

export interface ScoredChunk {
  chunk_id: string;
  doc_id: string;
  config_id: string;
  page_start: number;
  page_end: number;
  ordinal: number;
  section_title: string | null;
  text: string;
  score: number;
  raw_bm25_score?: number | null;
  raw_embedding_score?: number | null;
  retriever_source?: "lexical" | "embedding" | "hybrid" | "metadata";
  doc_title?: string | null;
  doc_authors?: string[] | null;
  doc_year?: number | null;
  doc_source_url?: string | null;
  page_label?: string | null;
}

export type ChunkConfigId = "ck256" | "ck640";

export interface RetrievalOptions {
  query: string;
  queryVector?: number[];
  configId: ChunkConfigId;
  scopeDocId?: string | null;
  corpusVersion?: string | null;
  k?: number;
  k1?: number; // BM25 term frequency saturation (default 1.2)
  b?: number;  // BM25 document length normalization (default 0.75)
  enableMetadataAugmentation?: boolean;
}

export interface Retriever {
  retrieve(options: RetrievalOptions): Promise<ScoredChunk[]>;
}
