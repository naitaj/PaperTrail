/**
 * Okapi BM25 Lexical Retriever (TRD §6.1, §8.4, §8.5).
 * Implemented natively inside PostgreSQL using term statistics strictly over chunks.content_tsv.
 * Contains zero metadata injection so pure lexical retrieval and benchmarks are 100% uncontaminated.
 */

import { query } from "@/lib/db/client";
import { RetrievalOptions, Retriever, ScoredChunk } from "./types";

const BM25_QUERY = `
WITH q AS (
  SELECT DISTINCT u.lexeme FROM unnest(to_tsvector('english', $1)) u
  WHERE u.lexeme <> ALL ($5::text[])
),
cand AS (
  SELECT c.chunk_id,
         COALESCE(NULLIF(c.lex_len, 0), cardinality(tsvector_to_array(c.content_tsv)), 1) AS lex_len,
         c.content_tsv
  FROM chunks c
  JOIN documents d ON d.doc_id = c.doc_id
  WHERE c.config_id = $2 AND NOT c.is_references
    AND ($3::text IS NULL OR c.doc_id = $3)
    AND ($8::text IS NULL OR d.corpus_version = $8)
    AND c.content_tsv @@ (SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) FROM q)
),
tf AS (
  SELECT cand.chunk_id, cand.lex_len, u.lexeme, array_length(u.positions, 1) AS tf
  FROM cand, LATERAL unnest(cand.content_tsv) u
  WHERE u.lexeme IN (SELECT lexeme FROM q)
)
SELECT tf.chunk_id,
       SUM( ln(1.0 + (GREATEST(s.n_chunks, 1) - LEAST(COALESCE(t.df, 1), GREATEST(s.n_chunks, 1)) + 0.5)
                    / (LEAST(COALESCE(t.df, 1), GREATEST(s.n_chunks, 1)) + 0.5))
            * (tf.tf * ($6::double precision + 1.0))
            / (tf.tf + $6::double precision * (1.0 - $7::double precision + $7::double precision * tf.lex_len / GREATEST(s.avgdl, 1.0))) ) AS score
FROM tf
LEFT JOIN lexical_terms t ON t.config_id = $2 AND t.term = tf.lexeme
JOIN lexical_stats s ON s.config_id = $2
GROUP BY tf.chunk_id
ORDER BY score DESC, tf.chunk_id
LIMIT $4;
`;

const HYDRATE_QUERY = `
SELECT c.chunk_id, c.doc_id, c.config_id, c.page_start, c.page_end, c.ordinal, c.section_title, c.text,
       p.page_label, d.title AS doc_title, d.authors AS doc_authors, d.year AS doc_year, d.source_url AS doc_source_url
FROM chunks c
JOIN documents d ON d.doc_id = c.doc_id
LEFT JOIN document_pages p ON p.doc_id = c.doc_id AND p.page_index = c.page_start
WHERE c.chunk_id = ANY ($1::text[]);
`;

export class LexicalRetriever implements Retriever {
  async retrieve(options: RetrievalOptions): Promise<ScoredChunk[]> {
    const {
      query: queryString,
      configId,
      scopeDocId = null,
      corpusVersion = null,
      k = 5,
      k1 = 1.2,
      b = 0.75,
    } = options;

    const trimmedQuery = queryString.trim();
    if (!trimmedQuery) {
      return [];
    }

    // De-noise query terms: strip procedural references like "Section 3" or "Table 2"
    // which cause BM25 to over-index on structural headers rather than technical content.
    const cleanedQuery = trimmedQuery
      .replace(/\b(section|sec\.?|table|tab\.?|figure|fig\.?|appendix)\s+\d+[a-z]?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const effectiveQuery = cleanedQuery.length >= 5 ? cleanedQuery : trimmedQuery;

    const stoplist: string[] = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"];

    interface Bm25Row {
      chunk_id: string;
      score: string | number;
    }

    const rankedRows = await query<Bm25Row>(BM25_QUERY, [
      effectiveQuery,
      configId,
      scopeDocId,
      k,
      stoplist,
      k1,
      b,
      corpusVersion,
    ]);

    if (!rankedRows || rankedRows.length === 0) {
      return [];
    }

    const chunkIds = rankedRows.map((r) => r.chunk_id);
    const scoreMap = new Map<string, number>(
      rankedRows.map((r) => [r.chunk_id, typeof r.score === "string" ? parseFloat(r.score) : r.score])
    );

    interface HydrateRow {
      chunk_id: string;
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

    const hydratedRows = await query<HydrateRow>(HYDRATE_QUERY, [chunkIds]);

    const result: ScoredChunk[] = hydratedRows.map((row) => {
      const rawScore = scoreMap.get(row.chunk_id) ?? 0;
      return {
        chunk_id: row.chunk_id,
        doc_id: row.doc_id,
        config_id: row.config_id,
        page_start: row.page_start,
        page_end: row.page_end,
        ordinal: row.ordinal,
        section_title: row.section_title,
        text: row.text,
        score: rawScore,
        raw_bm25_score: rawScore,
        raw_embedding_score: null,
        retriever_source: "lexical",
        doc_title: row.doc_title,
        doc_authors: row.doc_authors,
        doc_year: row.doc_year,
        doc_source_url: row.doc_source_url,
        page_label: row.page_label,
      };
    });

    result.sort((a, b) => b.score - a.score || a.chunk_id.localeCompare(b.chunk_id));

    return result;
  }
}

export const lexicalRetriever = new LexicalRetriever();
