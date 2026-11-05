/**
 * Dense Vector Embedding Retriever for PaperTrail (TRD §6.2, §8.4).
 * Performs exact cosine similarity search over 384-dimensional vectors using pgvector (<=>).
 */

import { query } from "@/lib/db/client";
import { RetrievalOptions, Retriever, ScoredChunk } from "./types";

export const DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

const VECTOR_QUERY = `
WITH candidates AS (
  SELECT c.chunk_id, 
         1.0 - (e.embedding <=> $1::vector) AS score,
         c.doc_id, 
         c.config_id, 
         c.page_start, 
         c.page_end, 
         c.ordinal, 
         c.section_title, 
         c.text,
         p.page_label, 
         d.title AS doc_title, 
         d.authors AS doc_authors, 
         d.year AS doc_year, 
         d.source_url AS doc_source_url,
         ROW_NUMBER() OVER (
           PARTITION BY c.doc_id 
           ORDER BY e.embedding <=> $1::vector ASC, c.chunk_id
         ) AS doc_rank
  FROM chunk_embeddings e 
  JOIN chunks c USING (chunk_id)
  JOIN documents d ON d.doc_id = c.doc_id
  LEFT JOIN document_pages p ON p.doc_id = c.doc_id AND p.page_index = c.page_start
  WHERE c.config_id = $2 
    AND e.embedding_model = $3 
    AND NOT c.is_references
    AND ($4::text IS NULL OR c.doc_id = $4)
    AND ($6::text IS NULL OR d.corpus_version = $6)
)
SELECT chunk_id, score, doc_id, config_id, page_start, page_end, ordinal, section_title, text, page_label, doc_title, doc_authors, doc_year, doc_source_url
FROM candidates
WHERE ($4::text IS NOT NULL OR doc_rank <= 5)
ORDER BY score DESC, chunk_id
LIMIT $5;
`;

export class EmbeddingRetriever implements Retriever {
  async retrieve(options: RetrievalOptions): Promise<ScoredChunk[]> {
    const {
      configId,
      queryVector,
      scopeDocId = null,
      corpusVersion = null,
      k = 5,
    } = options;

    if (!queryVector || queryVector.length !== 384) {
      throw new Error(
        `queryVector must be a 384-dimensional vector for model '${DEFAULT_EMBEDDING_MODEL}', received ${
          queryVector ? queryVector.length : "undefined"
        }`
      );
    }

    // Format vector as PostgreSQL array string: "[0.123, -0.456, ...]"
    const vectorString = `[${queryVector.join(",")}]`;

    interface VectorRow {
      chunk_id: string;
      score: string | number;
      doc_id: string;
      config_id: string;
      page_start: number;
      page_end: number;
      ordinal: number;
      section_title: string | null;
      text: string;
      page_label: string | null;
      doc_title: string | null;
      doc_authors: string[] | null;
      doc_year: number | null;
      doc_source_url: string | null;
    }

    const rows = await query<VectorRow>(VECTOR_QUERY, [
      vectorString,
      configId,
      DEFAULT_EMBEDDING_MODEL,
      scopeDocId,
      k,
      corpusVersion,
    ]);

    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      doc_id: r.doc_id,
      config_id: r.config_id,
      page_start: r.page_start,
      page_end: r.page_end,
      ordinal: r.ordinal,
      section_title: r.section_title,
      text: r.text,
      score: typeof r.score === "string" ? parseFloat(r.score) : r.score,
      page_label: r.page_label,
      doc_title: r.doc_title,
      doc_authors: r.doc_authors,
      doc_year: r.doc_year,
      doc_source_url: r.doc_source_url,
    }));
  }
}

export const embeddingRetriever = new EmbeddingRetriever();

