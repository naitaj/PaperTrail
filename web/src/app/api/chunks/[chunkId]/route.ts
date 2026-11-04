/**
 * GET /api/chunks/[chunkId] (TRD §8.5, §9.2, FR-CIT-04, FR-UI-05).
 * Returns passage text and neighbouring chunks for context expansion.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chunkId: string }> }
) {
  try {
    const { chunkId } = await params;

    const chunks = await query<Record<string, unknown>>(
      `SELECT c.chunk_id, c.doc_id, c.config_id, c.page_start, c.page_end, c.ordinal,
              c.section_title, c.text, c.token_count, c.is_references, c.has_table, c.math_heavy,
              p.page_label, d.title AS doc_title, d.authors AS doc_authors, d.year AS doc_year, d.source_url AS doc_source_url
       FROM chunks c
       JOIN documents d ON d.doc_id = c.doc_id
       LEFT JOIN document_pages p ON p.doc_id = c.doc_id AND p.page_index = c.page_start
       WHERE c.chunk_id = $1;`,
      [chunkId]
    );

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }

    const current = chunks[0];
    const currentOrdinal = typeof current.ordinal === "number" ? current.ordinal : parseInt(String(current.ordinal), 10);

    // Hydrate neighbouring chunks (ordinal - 1 and ordinal + 1)
    const neighbours = await query<Record<string, unknown>>(
      `SELECT chunk_id, ordinal, page_start, page_end, text
       FROM chunks
       WHERE doc_id = $1 AND config_id = $2 AND ordinal IN ($3, $4)
       ORDER BY ordinal ASC;`,
      [current.doc_id, current.config_id, currentOrdinal - 1, currentOrdinal + 1]
    );

    const prevChunk = neighbours.find((n) => Number(n.ordinal) === currentOrdinal - 1) || null;
    const nextChunk = neighbours.find((n) => Number(n.ordinal) === currentOrdinal + 1) || null;

    return NextResponse.json({
      chunk: current,
      prev_chunk: prevChunk,
      next_chunk: nextChunk,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal Server Error", detail: message }, { status: 500 });
  }
}
