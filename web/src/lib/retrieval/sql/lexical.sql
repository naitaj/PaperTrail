-- Okapi BM25 SQL Query Template (TRD §8.4)
-- Parameters:
--   $1: Normalized query string
--   $2: Chunk config_id ('ck256' or 'ck640')
--   $3: Document scope (doc_id or NULL for full corpus)
--   $4: k (top results limit)
--   $5: Stoplist array text[]
--   $6: k1 (BM25 parameter, default 1.2)
--   $7: b (BM25 parameter, default 0.75)

WITH q AS (
  SELECT DISTINCT u.lexeme FROM unnest(to_tsvector('english', $1)) u
  WHERE u.lexeme <> ALL ($5::text[])
),
cand AS (
  SELECT c.chunk_id, c.lex_len, c.content_tsv
  FROM chunks c
  WHERE c.config_id = $2 AND NOT c.is_references
    AND ($3::text IS NULL OR c.doc_id = $3)
    AND c.content_tsv @@ (SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) FROM q)
),
tf AS (
  SELECT cand.chunk_id, cand.lex_len, u.lexeme, array_length(u.positions, 1) AS tf
  FROM cand, LATERAL unnest(cand.content_tsv) u
  WHERE u.lexeme IN (SELECT lexeme FROM q)
)
SELECT tf.chunk_id,
       SUM( ln(1.0 + (s.n_chunks - t.df + 0.5) / (t.df + 0.5))
            * (tf.tf * ($6::double precision + 1.0)) / (tf.tf + $6::double precision * (1.0 - $7::double precision + $7::double precision * tf.lex_len / s.avgdl)) ) AS score
FROM tf
JOIN lexical_terms t ON t.config_id = $2 AND t.term = tf.lexeme
JOIN lexical_stats s ON s.config_id = $2
GROUP BY tf.chunk_id
ORDER BY score DESC, tf.chunk_id
LIMIT $4;
