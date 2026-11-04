/**
 * GET /api/documents (TRD §9.2, FR-COL-02, FR-UI-01).
 * Returns list of ingested papers with metadata.
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";

interface DocumentRow {
  doc_id: string;
  title: string | null;
  authors: string[] | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  source_url: string;
  n_pages: number;
  status: string;
  corpus_version: string;
}

export async function GET() {
  try {
    const docs = await query<DocumentRow>(`
      SELECT doc_id, title, authors, year, venue, doi, source_url, n_pages, status, corpus_version
      FROM documents
      WHERE status = 'ready'
      ORDER BY year DESC, title ASC;
    `);

    return NextResponse.json({
      documents: docs,
      total: docs.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error fetching documents:", message);
    return NextResponse.json(
      { error: "Failed to fetch documents", detail: message },
      { status: 500 }
    );
  }
}

