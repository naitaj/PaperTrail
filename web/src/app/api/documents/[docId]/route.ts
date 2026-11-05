/**
 * GET & DELETE /api/documents/[docId] (TRD §9.2, FR-COL-02, FR-COL-03).
 *
 * Security invariants on DELETE (Phase 2B):
 * 1. Never trust any client-supplied user ID header or body parameter.
 * 2. Verify the caller's cryptographic Supabase/session JWT server-side. Reject unauthenticated requests with 401.
 * 3. Inside a single database transaction, set the verified JWT claims (`request.jwt.claim.sub`) and switch to
 *    `SET LOCAL ROLE authenticated;` so Row-Level Security (RLS) cannot be bypassed.
 * 4. Invoke the SECURITY INVOKER database RPC `SELECT public.delete_user_document($1);`, which independently
 *    derives identity from `auth.uid()`, rejects `v1.0` corpus papers, and verifies `owner_id = auth.uid()`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbPool, query } from "@/lib/db/client";
import { verifyRequestSession } from "@/lib/auth/session";

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
  const { docId } = await params;

  // 1. Cryptographically verify the caller's JWT session server-side
  const session = await verifyRequestSession(req);
  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized: A verified authenticated session is required to delete documents.",
        doc_id: docId,
      },
      { status: 401 }
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 2. Bind verified JWT identity into PostgreSQL transaction context and enforce RLS role
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', 'authenticated', true);`,
      [session.claimsJson, session.uid]
    );
    await client.query("SET LOCAL ROLE authenticated;");

    // 3. Invoke SECURITY INVOKER RPC that derives identity strictly from auth.uid()
    const rpcRes = await client.query<{ delete_user_document: Record<string, unknown> }>(
      `SELECT public.delete_user_document($1);`,
      [docId]
    );

    await client.query("COMMIT");

    const payload = rpcRes.rows[0]?.delete_user_document || {
      success: true,
      doc_id: docId,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});

    const pgCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    const message = err instanceof Error ? err.message : String(err);

    if (pgCode === "28000") {
      return NextResponse.json(
        { error: "Unauthorized", detail: message, doc_id: docId },
        { status: 401 }
      );
    }
    if (pgCode === "P0002") {
      return NextResponse.json(
        { error: "Document not found", detail: message, doc_id: docId },
        { status: 404 }
      );
    }
    if (pgCode === "42501") {
      return NextResponse.json(
        { error: "Forbidden", detail: message, doc_id: docId },
        { status: 403 }
      );
    }

    console.error("Failed to delete document:", message);
    return NextResponse.json(
      { error: "Failed to delete document", detail: message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
