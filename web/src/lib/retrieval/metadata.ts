/**
 * Structured Document & Author Metadata Retriever (Phase 2A / Phase 4).
 *
 * Kept strictly separate from the underlying BM25, Dense Embedding, and Hybrid RRF
 * retrievers so benchmark retrieval modes are never silently altered.
 *
 * When explicitly enabled (`enableMetadataAugmentation: true`), this module checks
 * whether the user query references a known author name or paper title in `public.documents`
 * and returns the matching document's opening title/byline chunk (`ordinal = 0`, `page_start = 1`)
 * explicitly labelled with `retriever_source: "metadata"`.
 */

import { query } from "@/lib/db/client";
import { ChunkConfigId, ScoredChunk } from "./types";

const METADATA_LOOKUP_QUERY = `
SELECT c.chunk_id,
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
       d.source_url AS doc_source_url
FROM documents d
JOIN chunks c ON c.doc_id = d.doc_id AND c.ordinal = 0 AND c.config_id = $2
LEFT JOIN document_pages p ON p.doc_id = c.doc_id AND p.page_index = c.page_start
WHERE ($3::text IS NULL OR d.doc_id = $3)
  AND ($4::text IS NULL OR d.corpus_version = $4)
  AND $1::text <> ''
  AND (
    EXISTS (
      SELECT 1 FROM unnest(coalesce(d.authors, ARRAY[]::text[])) AS auth
      WHERE length(trim(auth)) >= 5
        AND position(lower(trim(auth)) in lower($1::text)) > 0
    )
    OR (
      lower($1::text) ~ '\\m(who|author|authors|wrote|written|affiliation|affiliated|university|institution)\\M'
      AND (
        EXISTS (
          SELECT 1 FROM unnest(coalesce(d.authors, ARRAY[]::text[])) AS auth
          WHERE length(regexp_replace(trim(auth), '^.*\\s+', '')) >= 3
            AND lower($1::text) ~ ('\\m' || lower(regexp_replace(trim(auth), '^.*\\s+', '')) || '\\M')
        )
        OR (
          d.title IS NOT NULL
          AND length(d.title) >= 4
          AND position(lower(split_part(d.title, ':', 1)) in lower($1::text)) > 0
        )
      )
    )
  )
ORDER BY d.doc_id ASC
LIMIT 3;
`;

export interface MetadataLookupOptions {
  query: string;
  configId: ChunkConfigId;
  scopeDocId?: string | null;
  corpusVersion?: string | null;
}

export async function retrieveMetadataAnchorChunks(
  options: MetadataLookupOptions
): Promise<ScoredChunk[]> {
  const {
    query: queryText,
    configId,
    scopeDocId = null,
    corpusVersion = null,
  } = options;

  const trimmed = (queryText || "").trim();
  if (!trimmed) return [];

  interface MetaRow {
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

  const rows = await query<MetaRow>(METADATA_LOOKUP_QUERY, [
    trimmed,
    configId,
    scopeDocId,
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
    score: 1.0,
    raw_bm25_score: null,
    raw_embedding_score: null,
    retriever_source: "metadata",
    page_label: r.page_label,
    doc_title: r.doc_title,
    doc_authors: r.doc_authors,
    doc_year: r.doc_year,
    doc_source_url: r.doc_source_url,
  }));
}

/**
 * Merge metadata-matched opening chunks with base retriever chunks while preserving
 * native scores and tagging metadata chunks explicitly (`retriever_source: "metadata"`).
 */
export function augmentWithMetadataChunks(
  baseChunks: ScoredChunk[],
  metadataChunks: ScoredChunk[],
  k: number
): ScoredChunk[] {
  if (!metadataChunks || metadataChunks.length === 0) {
    return baseChunks;
  }

  const baseMap = new Map<string, ScoredChunk>(baseChunks.map((c) => [c.chunk_id, c]));
  const result: ScoredChunk[] = [];
  const seen = new Set<string>();

  for (const mc of metadataChunks) {
    const existing = baseMap.get(mc.chunk_id);
    if (existing) {
      result.push({
        ...existing,
        retriever_source: "metadata",
      });
    } else {
      result.push(mc);
    }
    seen.add(mc.chunk_id);
  }

  for (const bc of baseChunks) {
    if (!seen.has(bc.chunk_id)) {
      result.push(bc);
      seen.add(bc.chunk_id);
    }
  }

  return result.slice(0, Math.max(k, result.length));
}

