"""Comprehensive schema verification and vector similarity test for PaperTrail."""

import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg

root_dir = Path(__file__).resolve().parents[3]
load_dotenv(root_dir / ".env")

REQUIRED_TABLES = [
    "documents",
    "document_pages",
    "chunk_configs",
    "chunks",
    "chunk_embeddings",
    "lexical_stats",
    "lexical_terms",
    "eval_questions",
    "eval_runs",
    "eval_results",
    "eval_annotations",
    "rate_limit_counters",
    "_migrations",
]

REQUIRED_INDEXES = [
    "chunks_tsv_gin",
    "chunks_cfg_doc",
    "chunks_doc_page",
    "eval_results_run",
    "eval_annotations_run",
]

def verify_all():
    db_url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    print("--- 1. Verifying Tables ---")
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public';
            """)
            existing_tables = {row[0] for row in cur.fetchall()}
            for tbl in REQUIRED_TABLES:
                if tbl in existing_tables:
                    print(f"  [TABLE OK] {tbl}")
                else:
                    raise RuntimeError(f"Missing required table: {tbl}")

            print("\n--- 2. Verifying Foreign Key Relationships ---")
            cur.execute("""
                SELECT
                    tc.table_name, 
                    kcu.column_name, 
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name 
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
            """)
            fks = cur.fetchall()
            for src_tbl, src_col, tgt_tbl, tgt_col in fks:
                print(f"  [FK OK] {src_tbl}.{src_col} -> {tgt_tbl}.{tgt_col}")

            print("\n--- 3. Verifying Indexes ---")
            cur.execute("""
                SELECT indexname, tablename 
                FROM pg_indexes 
                WHERE schemaname = 'public';
            """)
            existing_indexes = {row[0]: row[1] for row in cur.fetchall()}
            for idx in REQUIRED_INDEXES:
                if idx in existing_indexes:
                    print(f"  [INDEX OK] {idx} on {existing_indexes[idx]}")
                else:
                    raise RuntimeError(f"Missing required index: {idx}")

            print("\n--- 4. Testing Vector Storage & Cosine Similarity Search ---")
            # Create dummy vector of 1536 floats
            test_vector = [0.0] * 1536
            test_vector[0] = 1.0
            test_vector_query = [0.0] * 1536
            test_vector_query[0] = 0.99
            test_vector_query[1] = 0.05

            test_doc_id = "test-verification-doc"
            test_cfg_id = "test-cfg"
            test_chunk_id = f"{test_doc_id}:{test_cfg_id}:p1:c0"

            try:
                # Insert dependencies
                cur.execute("""
                    INSERT INTO chunk_configs (config_id, params) 
                    VALUES (%s, '{"target": 256}')
                    ON CONFLICT (config_id) DO NOTHING;
                """, (test_cfg_id,))

                cur.execute("""
                    INSERT INTO documents (doc_id, source_url, sha256, status, corpus_version)
                    VALUES (%s, 'https://example.com/test.pdf', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'ready', 'test-v1')
                    ON CONFLICT (doc_id) DO NOTHING;
                """, (test_doc_id,))

                cur.execute("""
                    INSERT INTO document_pages (doc_id, page_index, char_count)
                    VALUES (%s, 1, 100)
                    ON CONFLICT (doc_id, page_index) DO NOTHING;
                """, (test_doc_id,))

                cur.execute("""
                    INSERT INTO chunks (chunk_id, doc_id, config_id, page_start, page_end, ordinal, text, text_hash, token_count)
                    VALUES (%s, %s, %s, 1, 1, 0, 'Test chunk text for vector similarity.', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 10)
                    ON CONFLICT (chunk_id) DO NOTHING;
                """, (test_chunk_id, test_doc_id, test_cfg_id))

                cur.execute("""
                    INSERT INTO chunk_embeddings (chunk_id, embedding_model, embedding, text_hash)
                    VALUES (%s, 'text-embedding-3-small', %s, 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
                    ON CONFLICT (chunk_id, embedding_model) DO UPDATE SET embedding = EXCLUDED.embedding;
                """, (test_chunk_id, test_vector))

                print("  [INSERT OK] Inserted 1536-dimensional vector into chunk_embeddings")

                # Perform cosine similarity query (<=> operator is cosine distance: 1 - cosine_similarity)
                cur.execute("""
                    SELECT chunk_id, embedding <=> %s::vector AS cosine_distance
                    FROM chunk_embeddings
                    WHERE chunk_id = %s
                    ORDER BY cosine_distance ASC
                    LIMIT 1;
                """, (test_vector_query, test_chunk_id))
                row = cur.fetchone()
                assert row is not None, "Query returned no rows"
                dist = row[1]
                print(f"  [QUERY OK] Cosine distance query succeeded! Distance: {dist:.6f}")
                assert dist < 0.05, f"Expected small distance, got {dist}"

            finally:
                # Clean up test rows
                cur.execute("DELETE FROM documents WHERE doc_id = %s;", (test_doc_id,))
                cur.execute("DELETE FROM chunk_configs WHERE config_id = %s;", (test_cfg_id,))
                print("  [CLEANUP OK] Test data cleanly removed.")

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    verify_all()
