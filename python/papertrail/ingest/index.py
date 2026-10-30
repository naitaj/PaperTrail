"""Indexing stage: updates lexical statistics and term document frequencies for BM25."""

import psycopg

from papertrail.common.config import get_database_url


def update_lexical_index():
    """
    Computes and populates lexical_stats and lexical_terms for BM25 retrieval.
    """
    url = get_database_url()
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.cursor() as cur:
            print("1. Updating chunk lexeme lengths...")
            # Update lex_len from the generated content_tsv
            cur.execute("""
                UPDATE chunks
                SET lex_len = coalesce(cardinality(tsvector_to_array(content_tsv)), 0)
                WHERE lex_len = 0 OR lex_len IS NULL;
            """)

            cur.execute("SELECT config_id FROM chunk_configs;")
            configs = [row[0] for row in cur.fetchall()]

            for cfg in configs:
                print(f"2. Computing lexical statistics for {cfg}...")
                cur.execute("""
                    SELECT count(*), coalesce(avg(lex_len), 0.0)
                    FROM chunks
                    WHERE config_id = %s AND NOT is_references;
                """, (cfg,))
                n_chunks, avgdl = cur.fetchone()

                cur.execute("""
                    INSERT INTO lexical_stats (config_id, n_chunks, avgdl, computed_at)
                    VALUES (%s, %s, %s, now())
                    ON CONFLICT (config_id) DO UPDATE SET
                        n_chunks = EXCLUDED.n_chunks,
                        avgdl = EXCLUDED.avgdl,
                        computed_at = now();
                """, (cfg, n_chunks, float(avgdl)))
                print(f"   -> {cfg}: {n_chunks} chunks, avgdl = {avgdl:.2f}")

                print(f"3. Populating lexical_terms for {cfg}...")
                # Clear previous terms for this config
                cur.execute("DELETE FROM lexical_terms WHERE config_id = %s;", (cfg,))

                # Use ts_stat to get distinct document frequencies for all lexemes
                stat_query = f"SELECT content_tsv FROM chunks WHERE config_id = '{cfg}' AND NOT is_references"
                cur.execute("""
                    INSERT INTO lexical_terms (config_id, term, df)
                    SELECT %s, word, ndoc
                    FROM ts_stat(%s)
                    ON CONFLICT (config_id, term) DO UPDATE SET df = EXCLUDED.df;
                """, (cfg, stat_query))

                cur.execute("SELECT count(*) FROM lexical_terms WHERE config_id = %s;", (cfg,))
                n_terms = cur.fetchone()[0]
                print(f"   -> {cfg}: indexed {n_terms} distinct terms.")

            print("4. Running ANALYZE on chunks table...")
            cur.execute("ANALYZE chunks;")

    print("Lexical indexing complete!")

if __name__ == "__main__":
    update_lexical_index()
