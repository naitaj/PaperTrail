import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const BM25_QUERY = `
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
`;

const HYDRATE_QUERY = `
SELECT c.chunk_id, c.doc_id, c.config_id, c.page_start, c.page_end, c.ordinal, c.text,
       p.page_label, d.title AS doc_title
FROM chunks c
JOIN documents d ON d.doc_id = c.doc_id
LEFT JOIN document_pages p ON p.doc_id = c.doc_id AND p.page_index = c.page_start
WHERE c.chunk_id = ANY ($1::text[]);
`;

async function testRetrieval() {
  const queryText = "What two models does Lewis et al. introduce? RAG-Sequence and RAG-Token";
  console.log(`Testing BM25 retrieval for query: "${queryText}" on ck256...`);

  const stoplist = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"];
  const res = await pool.query(BM25_QUERY, [queryText, "ck256", null, 5, stoplist, 1.2, 0.75]);

  console.log(`Found ${res.rows.length} candidate chunks:`);
  const chunkIds = res.rows.map((r) => r.chunk_id);
  const scoreMap = new Map(res.rows.map((r) => [r.chunk_id, parseFloat(r.score)]));

  const hyd = await pool.query(HYDRATE_QUERY, [chunkIds]);
  const ranked = hyd.rows
    .map((r) => ({ ...r, score: scoreMap.get(r.chunk_id) }))
    .sort((a, b) => b.score - a.score);

  for (const r of ranked) {
    console.log(`\n  [Rank score=${r.score.toFixed(3)}] ${r.chunk_id} (Page ${r.page_start}) - Doc: ${r.doc_id}`);
    console.log(`    Snippet: ${r.text.substring(0, 160)}...`);
  }

  await pool.end();
}

testRetrieval();
