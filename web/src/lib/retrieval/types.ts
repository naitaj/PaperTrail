/**
 * Retrieval types for PaperTrail (TRD §6, §8.4).
 */

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
  doc_title?: string | null;
  doc_authors?: string[] | null;
  doc_year?: number | null;
  doc_source_url?: string | null;
  page_label?: string | null;
}

export type ChunkConfigId = "ck256" | "ck640";

export interface RetrievalOptions {
  query: string;
  configId: ChunkConfigId;
  scopeDocId?: string | null;
  k?: number;
  k1?: number; // BM25 term frequency saturation (default 1.2)
  b?: number;  // BM25 document length normalization (default 0.75)
}

export interface Retriever {
  retrieve(options: RetrievalOptions): Promise<ScoredChunk[]>;
}
