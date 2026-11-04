/**
 * GET /api/documents/[docId] (TRD §9.2, FR-COL-02, FR-COL-03).
 * Returns single paper details and page records.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const docs = await query<Record<string, unknown>>(
      `SELECT doc_id, title, authors, year, venue, doi, source_url, license, sha256, n_pages, status, status_detail, corpus_version, ingested_at
       FROM documents
       WHERE doc_id = $1;`,
      [docId]
    );

    if (!docs || docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const pages = await query<Record<string, unknown>>(
      `SELECT page_index, page_label, char_count, quality_flags
       FROM document_pages
       WHERE doc_id = $1
       ORDER BY page_index ASC;`,
      [docId]
    );

    return NextResponse.json({
      document: docs[0],
      pages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal Server Error", detail: message }, { status: 500 });
  }
}
