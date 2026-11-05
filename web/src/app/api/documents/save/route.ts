import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db/client";
import {
  attachSessionCookie,
  signSessionJwt,
  verifyRequestSession,
} from "@/lib/auth/session";

export const maxDuration = 30;

interface SavePayload {
  doc: {
    doc_id: string;
    title: string;
    authors?: string[];
    year?: number;
    venue?: string;
    doi?: string | null;
    source_url: string;
    sha256: string;
    text_hash: string;
    n_pages: number;
    corpus_version?: string;
  };
  pages: {
    page_index: number;
    char_count: number;
  }[];
  chunks: {
    chunk_id: string;
    doc_id: string;
    config_id: string;
    page_start: number;
    page_end: number;
    ordinal: number;
    section_title: string | null;
    text: string;
    text_hash: string;
    token_count: number;
    lex_len: number;
    is_references: boolean;
  }[];
  embeddings: number[][]; // 384-dimensional dense vectors corresponding to chunks
}

export async function POST(req: NextRequest) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    // 1. Verify existing authenticated session or issue a new cryptographically signed JWT session
    let session = await verifyRequestSession(req);
    let newlyIssuedToken: string | null = null;
    if (!session) {
      const newUid = crypto.randomUUID().toLowerCase();
      newlyIssuedToken = signSessionJwt(newUid);
      session = {
        uid: newUid,
        role: "authenticated",
        claimsJson: JSON.stringify({ sub: newUid, role: "authenticated" }),
      };
    }

    const body: SavePayload = await req.json();
    const { doc, pages, chunks, embeddings } = body;

    if (!doc || !chunks || !embeddings) {
      return NextResponse.json(
        { error: "Invalid payload. 'doc', 'chunks', and 'embeddings' are required." },
        { status: 400 }
      );
    }

    if (chunks.length !== embeddings.length) {
      return NextResponse.json(
        {
          error: `Chunk count (${chunks.length}) does not match embedding count (${embeddings.length})`,
        },
        { status: 400 }
      );
    }

    const targetCorpusVersion =
      doc.corpus_version === "staging-test-ephemeral"
        ? "staging-test-ephemeral"
        : "user-upload";

    // Begin atomic transaction with authenticated JWT claims & RLS role enforced
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', 'authenticated', true);`,
      [session.claimsJson, session.uid]
    );
    await client.query("SET LOCAL ROLE authenticated;");

    // 1. Upsert document with owner_id derived strictly from auth.uid() inside PostgreSQL
    await client.query(
      `
      INSERT INTO documents (
        doc_id, title, authors, year, venue, doi, source_url,
        license, sha256, text_hash, n_pages, status, status_detail,
        corpus_version, owner_id, ingested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, auth.uid(), now())
      ON CONFLICT (doc_id) DO UPDATE SET
        title = EXCLUDED.title,
        status = 'ready',
        status_detail = EXCLUDED.status_detail,
        ingested_at = now()
      WHERE documents.owner_id = auth.uid();
      `,
      [
        doc.doc_id,
        doc.title,
        doc.authors || ["User Upload"],
        doc.year || new Date().getFullYear(),
        doc.venue || "In-Browser Workspace",
        doc.doi || null,
        doc.source_url,
        "User Document",
        doc.sha256,
        doc.text_hash,
        doc.n_pages,
        "ready",
        "Ingested via In-Browser PDF Upload",
        targetCorpusVersion,
      ]
    );

    // 2. Upsert document pages
    for (const p of pages) {
      await client.query(
        `
        INSERT INTO document_pages (doc_id, page_index, page_label, char_count, quality_flags)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (doc_id, page_index) DO UPDATE SET
          char_count = EXCLUDED.char_count;
        `,
        [doc.doc_id, p.page_index, `p.${p.page_index}`, p.char_count, []]
      );
    }

    // 3. Upsert chunks and embeddings
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = embeddings[i];

      await client.query(
        `
        INSERT INTO chunks (
          chunk_id, doc_id, config_id, page_start, page_end,
          ordinal, section_title, text, text_hash, token_count,
          lex_len, is_references, has_table, math_heavy, layout_uncertain
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (chunk_id) DO UPDATE SET
          text = EXCLUDED.text,
          token_count = EXCLUDED.token_count,
          text_hash = EXCLUDED.text_hash;
        `,
        [
          c.chunk_id,
          c.doc_id,
          c.config_id,
          c.page_start,
          c.page_end,
          c.ordinal,
          c.section_title,
          c.text,
          c.text_hash,
          c.token_count,
          c.lex_len || 0,
          c.is_references || false,
          false,
          false,
          false,
        ]
      );

      const vectorString = `[${emb.join(",")}]`;
      await client.query(
        `
        INSERT INTO chunk_embeddings (chunk_id, embedding_model, embedding, text_hash, created_at)
        VALUES ($1, $2, $3::vector, $4, now())
        ON CONFLICT (chunk_id, embedding_model) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          text_hash = EXCLUDED.text_hash;
        `,
        [c.chunk_id, "sentence-transformers/all-MiniLM-L6-v2", vectorString, c.text_hash]
      );
    }

    // Populate accurate lexeme length from PostgreSQL tsvector for BM25 parity
    await client.query(
      `UPDATE chunks SET lex_len = coalesce(cardinality(tsvector_to_array(content_tsv)), 0) WHERE doc_id = $1;`,
      [doc.doc_id]
    );

    // Commit transaction
    await client.query("COMMIT");

    const response = NextResponse.json({
      success: true,
      doc_id: doc.doc_id,
      owner_id: session.uid,
      title: doc.title,
      total_chunks: chunks.length,
      message: "Document successfully ingested and indexed into vector database.",
    });

    if (newlyIssuedToken) {
      attachSessionCookie(response, newlyIssuedToken);
    }
    return response;
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => { });
    const message = err instanceof Error ? err.message : String(err);
    console.error("Save document error:", message);
    return NextResponse.json(
      { error: "Failed to save document to vector database", detail: message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
