"""Database loader: atomically upserts documents, document_pages, and chunks per document."""

import json

import psycopg

from papertrail.common.config import get_database_url
from papertrail.common.schemas import ChunkSchema, DocumentPageSchema, DocumentSchema


def load_chunk_configs_to_db(configs: dict[str, any]):
    """Ensure all chunk_configs exist in database."""
    url = get_database_url()
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.cursor() as cur:
            for cfg_id, params in configs.items():
                cur.execute("""
                    INSERT INTO chunk_configs (config_id, params)
                    VALUES (%s, %s)
                    ON CONFLICT (config_id) DO UPDATE
                    SET params = EXCLUDED.params;
                """, (cfg_id, json.dumps(params)))

def load_document_to_db(
    doc: DocumentSchema,
    pages: list[DocumentPageSchema],
    chunks: list[ChunkSchema]
):
    """
    Atomically upserts a document, its pages, and all its chunks in one transaction.
    """
    url = get_database_url()
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            # 1. Upsert document
            cur.execute("""
                INSERT INTO documents (
                    doc_id, title, authors, year, venue, doi, source_url,
                    license, sha256, text_hash, n_pages, status, status_detail,
                    duplicate_of, corpus_version
                ) VALUES (
                    %(doc_id)s, %(title)s, %(authors)s, %(year)s, %(venue)s, %(doi)s, %(source_url)s,
                    %(license)s, %(sha256)s, %(text_hash)s, %(n_pages)s, %(status)s, %(status_detail)s,
                    %(duplicate_of)s, %(corpus_version)s
                )
                ON CONFLICT (doc_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    authors = EXCLUDED.authors,
                    year = EXCLUDED.year,
                    venue = EXCLUDED.venue,
                    doi = EXCLUDED.doi,
                    sha256 = EXCLUDED.sha256,
                    text_hash = EXCLUDED.text_hash,
                    n_pages = EXCLUDED.n_pages,
                    status = EXCLUDED.status,
                    status_detail = EXCLUDED.status_detail,
                    duplicate_of = EXCLUDED.duplicate_of,
                    corpus_version = EXCLUDED.corpus_version,
                    ingested_at = now();
            """, doc.model_dump())

            # 2. Upsert document_pages
            for p in pages:
                cur.execute("""
                    INSERT INTO document_pages (
                        doc_id, page_index, page_label, char_count, quality_flags
                    ) VALUES (
                        %(doc_id)s, %(page_index)s, %(page_label)s, %(char_count)s, %(quality_flags)s
                    )
                    ON CONFLICT (doc_id, page_index) DO UPDATE SET
                        page_label = EXCLUDED.page_label,
                        char_count = EXCLUDED.char_count,
                        quality_flags = EXCLUDED.quality_flags;
                """, p.model_dump())

            # 3. Upsert chunks
            for c in chunks:
                chunk_data = c.model_dump()
                chunk_data["text"] = chunk_data["text"].replace("\x00", "")
                cur.execute("""
                    INSERT INTO chunks (
                        chunk_id, doc_id, config_id, page_start, page_end,
                        ordinal, section_title, text, text_hash, token_count,
                        lex_len, is_references, has_table, math_heavy, layout_uncertain
                    ) VALUES (
                        %(chunk_id)s, %(doc_id)s, %(config_id)s, %(page_start)s, %(page_end)s,
                        %(ordinal)s, %(section_title)s, %(text)s, %(text_hash)s, %(token_count)s,
                        %(lex_len)s, %(is_references)s, %(has_table)s, %(math_heavy)s, %(layout_uncertain)s
                    )
                    ON CONFLICT (chunk_id) DO UPDATE SET
                        text = EXCLUDED.text,
                        text_hash = EXCLUDED.text_hash,
                        token_count = EXCLUDED.token_count,
                        lex_len = EXCLUDED.lex_len,
                        is_references = EXCLUDED.is_references,
                        has_table = EXCLUDED.has_table,
                        math_heavy = EXCLUDED.math_heavy,
                        layout_uncertain = EXCLUDED.layout_uncertain;
                """, chunk_data)

        conn.commit()
