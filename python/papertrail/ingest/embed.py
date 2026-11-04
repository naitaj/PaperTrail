"""Local embedding generation for PaperTrail chunks using fastembed (all-MiniLM-L6-v2).

Computes 384-dimensional dense vectors locally and saves them to PostgreSQL chunk_embeddings.
Optimized with batch inserts and automatic reconnection for cloud Supabase stability.
"""

import time

import psycopg
from fastembed import TextEmbedding

from papertrail.common.config import get_database_url

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 128


def embed_all_chunks():
    print("=== Starting Local Embedding Pipeline ===", flush=True)
    print(f"Model: {MODEL_NAME} (384 dimensions)", flush=True)
    print("Loading local embedding model...", flush=True)
    model = TextEmbedding(model_name=MODEL_NAME)

    url = get_database_url()

    # Reconnection loop until all chunks are embedded
    while True:
        try:
            with psycopg.connect(url, connect_timeout=15) as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT c.chunk_id, c.text, c.text_hash
                        FROM chunks c
                        LEFT JOIN chunk_embeddings ce
                          ON ce.chunk_id = c.chunk_id AND ce.embedding_model = %s
                        WHERE ce.chunk_id IS NULL AND NOT c.is_references
                        ORDER BY c.doc_id, c.config_id, c.ordinal;
                    """, (MODEL_NAME,))

                    remaining_rows = cur.fetchall()
                    total_remaining = len(remaining_rows)

                    if total_remaining == 0:
                        print("All non-reference chunks are fully embedded in the database!", flush=True)
                        break

                    print(f"Remaining chunks to embed: {total_remaining}", flush=True)
                    start_time = time.time()
                    inserted = 0

                    for i in range(0, total_remaining, BATCH_SIZE):
                        batch = remaining_rows[i:i + BATCH_SIZE]
                        chunk_ids = [r[0] for r in batch]
                        texts = [r[1] for r in batch]
                        text_hashes = [r[2] for r in batch]

                        # Generate embeddings locally using CPU-optimized ONNX
                        vectors = list(model.embed(texts))

                        # Build records for executemany
                        records = [
                            (c_id, MODEL_NAME, vec.tolist(), t_hash)
                            for c_id, vec, t_hash in zip(chunk_ids, vectors, text_hashes)
                        ]

                        insert_query = """
                            INSERT INTO chunk_embeddings (chunk_id, embedding_model, embedding, text_hash)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (chunk_id, embedding_model)
                            DO UPDATE SET embedding = EXCLUDED.embedding, text_hash = EXCLUDED.text_hash;
                        """
                        cur.executemany(insert_query, records)
                        conn.commit()

                        inserted += len(batch)
                        elapsed = time.time() - start_time
                        rate = inserted / elapsed if elapsed > 0 else 0
                        print(f"  [{inserted}/{total_remaining}] Chunks embedded & committed ({rate:.1f} chunks/sec)", flush=True)

        except (psycopg.OperationalError, psycopg.DatabaseError) as err:
            print(f"Connection dropped ({err}), reconnecting in 3s...", flush=True)
            time.sleep(3.0)


if __name__ == "__main__":
    embed_all_chunks()
