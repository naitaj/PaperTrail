import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db/client";

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

    // Begin atomic transaction
    await client.query("BEGIN");

    // 1. Upsert document
    await client.query(
      `
      INSERT INTO documents (
        doc_id, title, authors, year, venue, doi, source_url,
        license, sha256, text_hash, n_pages, status, status_detail,
        corpus_version, ingested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
      ON CONFLICT (doc_id) DO UPDATE SET
        title = EXCLUDED.title,
        status = 'ready',
        status_detail = EXCLUDED.status_detail,
        ingested_at = now();
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
        doc.corpus_version || "user-upload",
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

      // Insert chunk
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

      // Insert vector embedding
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

    // Commit transaction
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      doc_id: doc.doc_id,
      title: doc.title,
      total_chunks: chunks.length,
      message: "Document successfully ingested and indexed into vector database.",
    });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
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

