"""Run baseline BM25 retrieval evaluation on dev split for both ck256 and ck640."""

import json

import psycopg

from papertrail.common.config import RESULTS_DIR, get_database_url
from papertrail.evaluation.dataset import is_chunk_relevant, load_eval_split
from papertrail.evaluation.metrics import (
    compute_hit_rate,
    compute_mrr,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_recall_at_k,
)

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

def evaluate_retrieval_on_split(split: str = "dev", k: int = 5):
    questions = load_eval_split(split)
    eval_questions = [q for q in questions if q["answerability"] in ("answerable", "partial")]

    print(f"Evaluating {len(eval_questions)} answerable/partial questions on split '{split}' (k={k})...")
    stoplist = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"]

    db_url = get_database_url()
    configs = ["ck256", "ck640"]
    summary_results = {}

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for cfg in configs:
                recalls, hit_rates, mrrs, precisions, ndcgs = [], [], [], [], []
                per_q_results = []

                for q in eval_questions:
                    q_text = q["question"]
                    gold_evidence = q.get("gold_evidence", [])
                    total_relevant = len(gold_evidence) or 1

                    cur.execute(
                        BM25_SQL,
                        (q_text, stoplist, cfg, None, None, 1.2, 1.2, 0.75, 0.75, cfg, cfg, k),
                    )
                    rows = cur.fetchall()

                    retrieved_chunks = [
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

                    is_relevant = [is_chunk_relevant(c, gold_evidence) for c in retrieved_chunks]

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

                    per_q_results.append({
                        "question_id": q["question_id"],
                        "category": q["category"],
                        "hit_rate": hr,
                        "recall": rec,
                        "mrr": mrr,
                        "precision": prec,
                        "ndcg": ndcg,
                        "num_retrieved": len(retrieved_chunks),
                    })

                mean_hr = sum(hit_rates) / len(hit_rates) if hit_rates else 0.0
                mean_rec = sum(recalls) / len(recalls) if recalls else 0.0
                mean_mrr = sum(mrrs) / len(mrrs) if mrrs else 0.0
                mean_prec = sum(precisions) / len(precisions) if precisions else 0.0
                mean_ndcg = sum(ndcgs) / len(ndcgs) if ndcgs else 0.0

                summary_results[cfg] = {
                    "mean_hit_rate": mean_hr,
                    "mean_recall_at_k": mean_rec,
                    "mean_mrr": mean_mrr,
                    "mean_precision_at_k": mean_prec,
                    "mean_ndcg_at_k": mean_ndcg,
                    "per_question": per_q_results,
                }

    out_file = RESULTS_DIR / f"retrieval_baseline_{split}.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary_results, f, indent=2)

    print(f"\n=== Lexical (BM25) Baseline Results on {split.upper()} Split (K={k}) ===")
    print("| Metric | ck256 | ck640 |")
    print("|---|---|---|")
    print(f"| **HitRate@{k}** | {summary_results['ck256']['mean_hit_rate'] * 100:.1f}% | {summary_results['ck640']['mean_hit_rate'] * 100:.1f}% |")
    print(f"| **Recall@{k}** | {summary_results['ck256']['mean_recall_at_k'] * 100:.1f}% | {summary_results['ck640']['mean_recall_at_k'] * 100:.1f}% |")
    print(f"| **MRR** | {summary_results['ck256']['mean_mrr']:.3f} | {summary_results['ck640']['mean_mrr']:.3f} |")
    print(f"| **Precision@{k}** | {summary_results['ck256']['mean_precision_at_k'] * 100:.1f}% | {summary_results['ck640']['mean_precision_at_k'] * 100:.1f}% |")
    print(f"| **nDCG@{k}** | {summary_results['ck256']['mean_ndcg_at_k']:.3f} | {summary_results['ck640']['mean_ndcg_at_k']:.3f} |")
    print(f"\nSaved benchmark results to {out_file}")

if __name__ == "__main__":
    evaluate_retrieval_on_split()
