/**
 * Hybrid Retriever for PaperTrail (TRD §6, §8.4).
 * Combines Dense Semantic Retrieval (pgvector all-MiniLM-L6-v2) and Lexical BM25 (PostgreSQL tsvector)
 * using genuine Reciprocal Rank Fusion (RRF) (Cormack et al., SIGIR 2009):
 *   RRF(d) = w_dense / (k_rrf + rank_dense(d)) + w_lexical / (k_rrf + rank_lexical(d))
 *
 * Preserves native component scores (raw_embedding_score, raw_bm25_score) on every ScoredChunk
 * so the abstention gate and UI can inspect genuine, un-distorted similarity and BM25 metrics.
 */

import { embeddingRetriever } from "./embedding";
import { lexicalRetriever } from "./lexical";
import { RetrievalOptions, Retriever, ScoredChunk } from "./types";

export interface HybridFusionOptions {
  rrfK?: number; // RRF constant (Cormack et al. standard: 60)
  denseWeight?: number;
  lexicalWeight?: number;
}

export function reciprocalRankFusion(
  denseChunks: ScoredChunk[],
  lexicalChunks: ScoredChunk[],
  options: HybridFusionOptions = {}
): ScoredChunk[] {
  const { rrfK = 60, denseWeight = 1.0, lexicalWeight = 1.0 } = options;

  interface FusionEntry {
    chunk: ScoredChunk;
    denseRank: number | null;
    lexicalRank: number | null;
    rawEmbeddingScore: number | null;
    rawBm25Score: number | null;
    rrfScore: number;
  }

  const map = new Map<string, FusionEntry>();

  denseChunks.forEach((c, idx) => {
    const rank = idx + 1;
    const rawCosine = c.raw_embedding_score ?? c.score;
    map.set(c.chunk_id, {
      chunk: { ...c },
      denseRank: rank,
      lexicalRank: null,
      rawEmbeddingScore: rawCosine,
      rawBm25Score: null,
      rrfScore: denseWeight / (rrfK + rank),
    });
  });

  lexicalChunks.forEach((c, idx) => {
    const rank = idx + 1;
    const rawBm25 = c.raw_bm25_score ?? c.score;
    const lexContrib = lexicalWeight / (rrfK + rank);
    const existing = map.get(c.chunk_id);

    if (existing) {
      existing.lexicalRank = rank;
      existing.rawBm25Score = rawBm25;
      existing.rrfScore += lexContrib;
      existing.chunk.doc_title = existing.chunk.doc_title || c.doc_title;
      existing.chunk.doc_authors = existing.chunk.doc_authors || c.doc_authors;
      existing.chunk.doc_year = existing.chunk.doc_year || c.doc_year;
    } else {
      map.set(c.chunk_id, {
        chunk: { ...c },
        denseRank: null,
        lexicalRank: rank,
        rawEmbeddingScore: null,
        rawBm25Score: rawBm25,
        rrfScore: lexContrib,
      });
    }
  });

  const fused = Array.from(map.values());

  // Sort by RRF score descending; break ties by dense similarity then BM25 score then chunk_id
  fused.sort((a, b) => {
    if (Math.abs(b.rrfScore - a.rrfScore) > 1e-9) {
      return b.rrfScore - a.rrfScore;
    }
    const aEmb = a.rawEmbeddingScore ?? -1;
    const bEmb = b.rawEmbeddingScore ?? -1;
    if (Math.abs(bEmb - aEmb) > 1e-6) {
      return bEmb - aEmb;
    }
    const aLex = a.rawBm25Score ?? -1;
    const bLex = b.rawBm25Score ?? -1;
    if (Math.abs(bLex - aLex) > 1e-6) {
      return bLex - aLex;
    }
    return a.chunk.chunk_id.localeCompare(b.chunk.chunk_id);
  });

  return fused.map((entry) => ({
    ...entry.chunk,
    score: Number(entry.rrfScore.toFixed(5)),
    raw_embedding_score: entry.rawEmbeddingScore,
    raw_bm25_score: entry.rawBm25Score,
    retriever_source:
      entry.denseRank !== null && entry.lexicalRank !== null
        ? "hybrid"
        : entry.denseRank !== null
        ? entry.chunk.retriever_source || "embedding"
        : "lexical",
  }));
}

export class HybridRetriever implements Retriever {
  async retrieve(options: RetrievalOptions): Promise<ScoredChunk[]> {
    const { k = 5 } = options;
    const candidateDepth = Math.max(k * 4, 25);

    const candidateOptions: RetrievalOptions = {
      ...options,
      k: candidateDepth,
    };

    const [denseResults, lexicalResults] = await Promise.all([
      options.queryVector && options.queryVector.length === 384
        ? embeddingRetriever.retrieve(candidateOptions)
        : Promise.resolve([] as ScoredChunk[]),
      lexicalRetriever.retrieve(candidateOptions),
    ]);

    if (denseResults.length === 0 && lexicalResults.length === 0) {
      return [];
    }

    const fused = reciprocalRankFusion(denseResults, lexicalResults, {
      rrfK: 60,
      denseWeight: 1.0,
      lexicalWeight: 1.0,
    });

    return fused.slice(0, k);
  }
}

export const hybridRetriever = new HybridRetriever();
