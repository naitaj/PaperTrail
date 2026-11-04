/**
 * GET & DELETE /api/documents/[docId] (TRD §9.2, FR-COL-02, FR-COL-03).
 * Returns single paper details or deletes an uploaded document with cascaded chunks.
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    // Delete chunks, embeddings, pages, and document in cascade
    await query(
      `DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT chunk_id FROM chunks WHERE doc_id = $1);`,
      [docId]
    );
    await query(`DELETE FROM chunks WHERE doc_id = $1;`, [docId]);
    await query(`DELETE FROM document_pages WHERE doc_id = $1;`, [docId]);
    const res = await query(`DELETE FROM documents WHERE doc_id = $1 RETURNING doc_id;`, [docId]);

    if (!res || res.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, doc_id: docId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to delete document:", message);
    return NextResponse.json(
      { error: "Failed to delete document", detail: message },
      { status: 500 }
    );
  }
}
