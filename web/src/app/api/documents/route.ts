/**
 * GET /api/documents (TRD §9.2, FR-COL-02, FR-UI-01).
 *
 * Returns list of ingested papers with metadata.
 * Implements Option A — Strict Private User Workspace:
 *   - v1.0 base corpus papers: always visible to everyone.
 *   - User-uploaded documents (corpus_version = 'user-upload'): only visible
 *     to the authenticated owner (owner_id matches the caller's JWT sub claim).
 *   - Legacy uploads with owner_id IS NULL: hidden from all users (orphaned).
 *
 * Unauthenticated callers see only the v1.0 base corpus.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import { verifyRequestSession } from "@/lib/auth/session";

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

export async function GET(req: NextRequest) {
  try {
    const session = await verifyRequestSession(req);
    const uid = session?.uid ?? null;

    let docs: DocumentRow[];

    if (uid) {
      // Authenticated: return v1.0 base papers + this user's own uploads
      docs = await query<DocumentRow>(
        `SELECT doc_id, title, authors, year, venue, doi, source_url, n_pages, status, corpus_version
         FROM documents
         WHERE status = 'ready'
           AND (corpus_version = 'v1.0' OR owner_id = $1)
         ORDER BY year DESC, title ASC;`,
        [uid]
      );
    } else {
      // Unauthenticated: return only v1.0 base papers
      docs = await query<DocumentRow>(
        `SELECT doc_id, title, authors, year, venue, doi, source_url, n_pages, status, corpus_version
         FROM documents
         WHERE status = 'ready'
           AND corpus_version = 'v1.0'
         ORDER BY year DESC, title ASC;`
      );
    }

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

