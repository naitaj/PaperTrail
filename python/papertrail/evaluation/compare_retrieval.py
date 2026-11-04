"""Compare BM25 vs. Local Dense Embedding Retrieval on the dev split.

TRD §6, §10, FR-RET-01..04.
Evaluates both lexical (BM25) and dense embeddings (sentence-transformers/all-MiniLM-L6-v2)
across ck256 and ck640 chunking strategies.
"""

import json

import psycopg
from fastembed import TextEmbedding

from papertrail.common.config import RESULTS_DIR, get_database_url
from papertrail.evaluation.dataset import is_chunk_relevant, load_eval_split
from papertrail.evaluation.metrics import (
    compute_hit_rate,
    compute_mrr,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_recall_at_k,
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

BM25_SQL = """
WITH q AS (
  SELECT DISTINCT u.lexeme FROM unnest(to_tsvector('english', %s)) u
  WHERE u.lexeme <> ALL (%s::text[])
),
cand AS (
  SELECT c.chunk_id, c.doc_id, c.page_start, c.page_end, c.ordinal, c.text, c.lex_len, c.content_tsv
  FROM chunks c
  WHERE c.config_id = %s AND NOT c.is_references
    AND (%s::text IS NULL OR c.doc_id = %s)
    AND c.content_tsv @@ (SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) FROM q)
),
tf AS (
  SELECT cand.chunk_id, cand.doc_id, cand.page_start, cand.page_end, cand.ordinal, cand.text, cand.lex_len, u.lexeme, array_length(u.positions, 1) AS tf
  FROM cand, LATERAL unnest(cand.content_tsv) u
  WHERE u.lexeme IN (SELECT lexeme FROM q)
)
SELECT tf.chunk_id, tf.doc_id, tf.page_start, tf.page_end, tf.ordinal, tf.text,
       SUM( ln(1.0 + (s.n_chunks - t.df + 0.5) / (t.df + 0.5))
            * (tf.tf * (%s::double precision + 1.0)) / (tf.tf + %s::double precision * (1.0 - %s::double precision + %s::double precision * tf.lex_len / s.avgdl)) ) AS score
FROM tf
JOIN lexical_terms t ON t.config_id = %s AND t.term = tf.lexeme
JOIN lexical_stats s ON s.config_id = %s
GROUP BY tf.chunk_id, tf.doc_id, tf.page_start, tf.page_end, tf.ordinal, tf.text
ORDER BY score DESC, tf.chunk_id
LIMIT %s;
"""

EMBEDDING_SQL = """
SELECT c.chunk_id, c.doc_id, c.page_start, c.page_end, c.ordinal, c.text,
       (1.0 - (ce.embedding <=> %s::vector))::double precision AS score
FROM chunks c
JOIN chunk_embeddings ce ON ce.chunk_id = c.chunk_id AND ce.embedding_model = %s
WHERE c.config_id = %s AND NOT c.is_references
  AND (%s::text IS NULL OR c.doc_id = %s)
ORDER BY ce.embedding <=> %s::vector ASC, c.chunk_id ASC
LIMIT %s;
"""


def run_comparison(split: str = "dev", k: int = 5):
    questions = load_eval_split(split)
    eval_questions = [q for q in questions if q["answerability"] in ("answerable", "partial")]

    print(f"=== Comparative Retrieval Benchmark: BM25 vs. Local Embedding ({MODEL_NAME}) ===")
    print(f"Split: {split} ({len(eval_questions)} answerable/partial questions), k={k}")

    print("Loading local embedding model for query embedding generation...")
    embed_model = TextEmbedding(model_name=MODEL_NAME)

    stoplist = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"]
    db_url = get_database_url()
    configs = ["ck256", "ck640"]
    retrievers = ["bm25", "embedding"]

    results = {}

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for ret in retrievers:
                results[ret] = {}
                for cfg in configs:
                    hit_rates, recalls, mrrs, precisions, ndcgs = [], [], [], [], []
                    per_q = []

                    for q in eval_questions:
                        q_text = q["question"]
                        gold_evidence = q.get("gold_evidence", [])
                        total_relevant = len(gold_evidence) or 1

                        if ret == "bm25":
                            cur.execute(
                                BM25_SQL,
                                (q_text, stoplist, cfg, None, None, 1.2, 1.2, 0.75, 0.75, cfg, cfg, k),
                            )
                        else:
                            # Generate query embedding locally
                            q_vec = list(embed_model.embed([q_text]))[0].tolist()
                            cur.execute(
                                EMBEDDING_SQL,
                                (q_vec, MODEL_NAME, cfg, None, None, q_vec, k),
                            )

                        rows = cur.fetchall()
                        retrieved = [
                            {
                                "chunk_id": r[0],
                                "doc_id": r[1],
                                "page_start": r[2],
                                "page_end": r[3],
                                "ordinal": r[4],
                                "text": r[5],
                                "score": float(r[6]),
                            }
                            for r in rows
                        ]

                        is_relevant = [is_chunk_relevant(c, gold_evidence) for c in retrieved]

                        hr = compute_hit_rate(is_relevant, k)
                        rec = compute_recall_at_k(is_relevant, total_relevant, k)
                        mrr = compute_mrr(is_relevant)
                        prec = compute_precision_at_k(is_relevant, k)
                        ndcg = compute_ndcg_at_k(is_relevant, total_relevant, k)

                        hit_rates.append(hr)
                        recalls.append(rec)
                        mrrs.append(mrr)
                        precisions.append(prec)
                        ndcgs.append(ndcg)

                        per_q.append({
                            "question_id": q["question_id"],
                            "hit_rate": hr,
                            "recall": rec,
                            "mrr": mrr,
                            "precision": prec,
                            "ndcg": ndcg,
                        })

                    results[ret][cfg] = {
                        "mean_hit_rate": sum(hit_rates) / len(hit_rates) if hit_rates else 0.0,
                        "mean_recall_at_k": sum(recalls) / len(recalls) if recalls else 0.0,
                        "mean_mrr": sum(mrrs) / len(mrrs) if mrrs else 0.0,
                        "mean_precision_at_k": sum(precisions) / len(precisions) if precisions else 0.0,
                        "mean_ndcg_at_k": sum(ndcgs) / len(ndcgs) if ndcgs else 0.0,
                        "per_question": per_q,
                    }

    # Save to data/results/comparison_dev.json
    out_file = RESULTS_DIR / f"comparison_{split}.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nSaved comparative benchmark results to {out_file}")

    print("\n" + "=" * 65)
    print(f"RETRIEVAL BENCHMARK COMPARISON ({split.upper()} SPLIT, K={k})")
    print("=" * 65)
    header = f"{'Metric':<16} | {'BM25 (ck256)':<12} | {'BM25 (ck640)':<12} | {'Embed (ck256)':<13} | {'Embed (ck640)':<13}"
    print(header)
    print("-" * len(header))

    metrics = [
        ("HitRate@5", "mean_hit_rate", True),
        ("Recall@5", "mean_recall_at_k", True),
        ("MRR", "mean_mrr", False),
        ("Precision@5", "mean_precision_at_k", True),
        ("nDCG@5", "mean_ndcg_at_k", False),
    ]

    for name, key, is_pct in metrics:
        b256 = results["bm25"]["ck256"][key]
        b640 = results["bm25"]["ck640"][key]
        e256 = results["embedding"]["ck256"][key]
        e640 = results["embedding"]["ck640"][key]

        if is_pct:
            print(f"{name:<16} | {b256*100:>11.1f}% | {b640*100:>11.1f}% | {e256*100:>12.1f}% | {e640*100:>12.1f}%")
        else:
            print(f"{name:<16} | {b256:>12.3f} | {b640:>12.3f} | {e256:>12.3f} | {e640:>13.3f}")

    print("=" * 65)


if __name__ == "__main__":
    run_comparison()
