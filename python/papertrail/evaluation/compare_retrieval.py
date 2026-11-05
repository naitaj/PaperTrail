"""Compare BM25, Local Dense Embedding, and Hybrid RRF Retrieval on the dev or test split.

TRD §6, §10, FR-RET-01..04.
Preserves strictly pure BM25 (`bm25`), pure Dense Embedding (`embedding`), and pure Hybrid RRF (`hybrid`)
retrieval modes without silent metadata injection.
Structured metadata lookup (`metadata_lookup` / `augment_with_metadata_chunks`) is maintained as a
separately identifiable mechanism (`retriever_source: "metadata"`).
"""

import json
from typing import Any

import psycopg
from fastembed import TextEmbedding

from papertrail.common.config import RESULTS_DIR, get_database_url
from papertrail.evaluation.dataset import (
    is_chunk_relevant,
    load_eval_split,
    load_gold_annotations,
)
from papertrail.evaluation.metrics import (
    compute_hit_rate,
    compute_mrr,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_recall_at_k,
)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

STOPLIST = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for"]

# Pure Okapi BM25 strictly over chunks.content_tsv (exact parity with web/src/lib/retrieval/lexical.ts)
BM25_SQL = """
WITH q AS (
  SELECT DISTINCT u.lexeme
  FROM unnest(to_tsvector('english', %s)) u
  WHERE u.lexeme <> ALL (%s::text[])
),
q_tsquery AS (
  SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS tsq
  FROM q
),
cand AS (
  SELECT c.chunk_id, c.doc_id, c.config_id, c.page_start, c.page_end,
         c.ordinal, c.section_title, c.text,
         d.title AS doc_title, d.authors AS doc_authors, d.year AS doc_year,
         COALESCE(NULLIF(c.lex_len, 0), cardinality(tsvector_to_array(c.content_tsv)), 1) AS lex_len,
         c.content_tsv
  FROM chunks c
  JOIN documents d ON d.doc_id = c.doc_id
  CROSS JOIN q_tsquery qt
  WHERE c.config_id = %s
    AND NOT c.is_references
    AND d.corpus_version = %s
    AND (%s::text IS NULL OR c.doc_id = %s)
    AND qt.tsq IS NOT NULL
    AND c.content_tsv @@ qt.tsq
),
tf AS (
  SELECT cand.chunk_id, cand.doc_id, cand.config_id, cand.page_start, cand.page_end,
         cand.ordinal, cand.section_title, cand.text,
         cand.doc_title, cand.doc_authors, cand.doc_year,
         cand.lex_len, u.lexeme,
         array_length(u.positions, 1) AS tf
  FROM cand, LATERAL unnest(cand.content_tsv) u
  WHERE u.lexeme IN (SELECT lexeme FROM q)
)
SELECT tf.chunk_id, tf.doc_id, tf.config_id, tf.page_start, tf.page_end,
       tf.ordinal, tf.section_title, tf.text,
       tf.doc_title, tf.doc_authors, tf.doc_year,
       SUM(
         ln(1.0 + (GREATEST(s.n_chunks, 1) - LEAST(COALESCE(t.df, 1), GREATEST(s.n_chunks, 1)) + 0.5)
                  / (LEAST(COALESCE(t.df, 1), GREATEST(s.n_chunks, 1)) + 0.5))
         * (tf.tf * (%s::double precision + 1.0))
         / (tf.tf + %s::double precision * (1.0 - %s::double precision + %s::double precision * tf.lex_len / GREATEST(s.avgdl, 1.0)))
       ) AS score
FROM tf
LEFT JOIN lexical_terms t ON t.config_id = %s AND t.term = tf.lexeme
JOIN lexical_stats s ON s.config_id = %s
GROUP BY tf.chunk_id, tf.doc_id, tf.config_id, tf.page_start, tf.page_end,
         tf.ordinal, tf.section_title, tf.text,
         tf.doc_title, tf.doc_authors, tf.doc_year
ORDER BY score DESC, tf.chunk_id ASC
LIMIT %s;
"""

# Pure Dense Embedding Cosine Similarity (exact parity with web/src/lib/retrieval/embedding.ts)
EMBEDDING_SQL = """
WITH candidates AS (
  SELECT c.chunk_id,
         c.doc_id,
         c.config_id,
         c.page_start,
         c.page_end,
         c.ordinal,
         c.section_title,
         c.text,
         d.title AS doc_title,
         d.authors AS doc_authors,
         d.year AS doc_year,
         (1.0 - (e.embedding <=> %(q_vec)s::vector))::double precision AS raw_cosine,
         (1.0 - (e.embedding <=> %(q_vec)s::vector))::double precision AS score,
         ROW_NUMBER() OVER (
           PARTITION BY c.doc_id
           ORDER BY e.embedding <=> %(q_vec)s::vector ASC, c.chunk_id
         ) AS doc_rank
  FROM chunk_embeddings e
  JOIN chunks c USING (chunk_id)
  JOIN documents d ON d.doc_id = c.doc_id
  WHERE c.config_id = %(cfg)s
    AND e.embedding_model = %(model_name)s
    AND NOT c.is_references
    AND (%(scope_doc_id)s::text IS NULL OR c.doc_id = %(scope_doc_id)s)
    AND d.corpus_version = %(corpus_version)s
)
SELECT chunk_id, doc_id, config_id, page_start, page_end,
       ordinal, section_title, text,
       doc_title, doc_authors, doc_year,
       raw_cosine, score
FROM candidates
WHERE (%(scope_doc_id)s::text IS NOT NULL OR doc_rank <= 5)
ORDER BY score DESC, chunk_id ASC
LIMIT %(k)s;
"""

# Separate Structured Metadata Lookup SQL (exact parity with web/src/lib/retrieval/metadata.ts)
METADATA_LOOKUP_SQL = """
SELECT c.chunk_id,
       c.doc_id,
       c.config_id,
       c.page_start,
       c.page_end,
       c.ordinal,
       c.section_title,
       c.text,
       d.title AS doc_title,
       d.authors AS doc_authors,
       d.year AS doc_year
FROM documents d
JOIN chunks c ON c.doc_id = d.doc_id AND c.ordinal = 0 AND c.config_id = %(cfg)s
WHERE (%(scope_doc_id)s::text IS NULL OR d.doc_id = %(scope_doc_id)s)
  AND d.corpus_version = %(corpus_version)s
  AND %(query_text)s::text <> ''
  AND (
    EXISTS (
      SELECT 1 FROM unnest(coalesce(d.authors, ARRAY[]::text[])) AS auth
      WHERE length(trim(auth)) >= 5
        AND position(lower(trim(auth)) in lower(%(query_text)s::text)) > 0
    )
    OR (
      lower(%(query_text)s::text) ~ '\\m(who|author|authors|wrote|written|affiliation|affiliated|university|institution)\\M'
      AND (
        EXISTS (
          SELECT 1 FROM unnest(coalesce(d.authors, ARRAY[]::text[])) AS auth
          WHERE length(regexp_replace(trim(auth), '^.*\\s+', '')) >= 3
            AND lower(%(query_text)s::text) ~ ('\\m' || lower(regexp_replace(trim(auth), '^.*\\s+', '')) || '\\M')
        )
        OR (
          d.title IS NOT NULL
          AND length(d.title) >= 4
          AND position(lower(split_part(d.title, ':', 1)) in lower(%(query_text)s::text)) > 0
        )
      )
    )
  )
ORDER BY d.doc_id ASC
LIMIT 3;
"""


def _row_to_chunk(r: tuple[Any, ...], is_embedding: bool = False) -> dict[str, Any]:
    if is_embedding:
        return {
            "chunk_id": r[0],
            "doc_id": r[1],
            "config_id": r[2],
            "page_start": int(r[3]),
            "page_end": int(r[4]),
            "ordinal": int(r[5]),
            "section_title": r[6],
            "text": r[7],
            "doc_title": r[8],
            "doc_authors": r[9] or [],
            "doc_year": int(r[10]) if r[10] is not None else None,
            "raw_embedding_score": float(r[11]),
            "score": float(r[12]),
            "retriever_source": "embedding",
        }
    return {
        "chunk_id": r[0],
        "doc_id": r[1],
        "config_id": r[2],
        "page_start": int(r[3]),
        "page_end": int(r[4]),
        "ordinal": int(r[5]),
        "section_title": r[6],
        "text": r[7],
        "doc_title": r[8],
        "doc_authors": r[9] or [],
        "doc_year": int(r[10]) if r[10] is not None else None,
        "raw_bm25_score": float(r[11]),
        "score": float(r[11]),
        "retriever_source": "lexical",
    }


def query_bm25(
    cur: psycopg.Cursor[Any],
    q_text: str,
    cfg: str,
    k: int,
    corpus_version: str = "v1.0",
    scope_doc_id: str | None = None,
) -> list[dict[str, Any]]:
    cur.execute(
        BM25_SQL,
        (
            q_text,
            STOPLIST,
            cfg,
            corpus_version,
            scope_doc_id,
            scope_doc_id,
            1.2,
            1.2,
            0.75,
            0.75,
            cfg,
            cfg,
            k,
        ),
    )
    return [_row_to_chunk(r, is_embedding=False) for r in cur.fetchall()]


def query_embedding(
    cur: psycopg.Cursor[Any],
    q_text: str,
    q_vec: list[float],
    cfg: str,
    k: int,
    corpus_version: str = "v1.0",
    scope_doc_id: str | None = None,
) -> list[dict[str, Any]]:
    cur.execute(
        EMBEDDING_SQL,
        {
            "scope_doc_id": scope_doc_id,
            "corpus_version": corpus_version,
            "q_vec": q_vec,
            "cfg": cfg,
            "model_name": MODEL_NAME,
            "k": k,
        },
    )
    return [_row_to_chunk(r, is_embedding=True) for r in cur.fetchall()]


def query_hybrid_rrf(
    cur: psycopg.Cursor[Any],
    q_text: str,
    q_vec: list[float],
    cfg: str,
    k: int,
    corpus_version: str = "v1.0",
    scope_doc_id: str | None = None,
) -> list[dict[str, Any]]:
    candidate_depth = max(k * 4, 25)
    dense_results = query_embedding(
        cur, q_text, q_vec, cfg, candidate_depth, corpus_version, scope_doc_id
    )
    lex_results = query_bm25(
        cur, q_text, cfg, candidate_depth, corpus_version, scope_doc_id
    )

    rrf_k = 60.0
    w_dense = 1.0
    w_lex = 1.0
    merged: dict[str, dict[str, Any]] = {}

    for idx, c in enumerate(dense_results):
        rank = idx + 1
        rrf_contrib = w_dense / (rrf_k + rank)
        merged[c["chunk_id"]] = {
            **c,
            "rrf_score": rrf_contrib,
            "raw_embedding_score": c.get("raw_embedding_score", c["score"]),
            "raw_bm25_score": None,
            "retriever_source": "hybrid",
        }

    for idx, c in enumerate(lex_results):
        rank = idx + 1
        rrf_contrib = w_lex / (rrf_k + rank)
        cid = c["chunk_id"]
        if cid in merged:
            merged[cid]["rrf_score"] += rrf_contrib
            merged[cid]["raw_bm25_score"] = c.get("raw_bm25_score", c["score"])
        else:
            merged[cid] = {
                **c,
                "rrf_score": rrf_contrib,
                "raw_embedding_score": None,
                "raw_bm25_score": c.get("raw_bm25_score", c["score"]),
                "retriever_source": "hybrid",
            }

    ranked = sorted(
        merged.values(),
        key=lambda x: (-x["rrf_score"], x["chunk_id"]),
    )[:k]
    for item in ranked:
        item["score"] = float(item.pop("rrf_score"))
    return ranked


def query_metadata_lookup(
    cur: psycopg.Cursor[Any],
    q_text: str,
    cfg: str,
    corpus_version: str = "v1.0",
    scope_doc_id: str | None = None,
) -> list[dict[str, Any]]:
    """Separately identifiable structured metadata lookup for author/title opening chunks."""
    cur.execute(
        METADATA_LOOKUP_SQL,
        {
            "query_text": q_text.strip(),
            "cfg": cfg,
            "scope_doc_id": scope_doc_id,
            "corpus_version": corpus_version,
        },
    )
    rows = cur.fetchall()
    return [
        {
            "chunk_id": r[0],
            "doc_id": r[1],
            "config_id": r[2],
            "page_start": int(r[3]),
            "page_end": int(r[4]),
            "ordinal": int(r[5]),
            "section_title": r[6],
            "text": r[7],
            "doc_title": r[8],
            "doc_authors": r[9] or [],
            "doc_year": int(r[10]) if r[10] is not None else None,
            "raw_bm25_score": None,
            "raw_embedding_score": None,
            "score": 1.0,
            "retriever_source": "metadata",
        }
        for r in rows
    ]


def augment_with_metadata_chunks(
    base_chunks: list[dict[str, Any]],
    metadata_chunks: list[dict[str, Any]],
    k: int,
) -> list[dict[str, Any]]:
    if not metadata_chunks:
        return base_chunks
    base_map = {c["chunk_id"]: c for c in base_chunks}
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for mc in metadata_chunks:
        cid = mc["chunk_id"]
        if cid in base_map:
            merged.append({**base_map[cid], "retriever_source": "metadata"})
        else:
            merged.append(mc)
        seen.add(cid)
    for bc in base_chunks:
        if bc["chunk_id"] not in seen:
            merged.append(bc)
            seen.add(bc["chunk_id"])
    return merged[:k]


def run_comparison(split: str = "dev", k: int = 5):
    questions = load_eval_split(split)
    gold_annotations = load_gold_annotations()
    eval_questions = [q for q in questions if q["answerability"] in ("answerable", "partial")]

    print(f"=== Comparative Retrieval Benchmark: Pure BM25 vs. Pure Dense vs. Pure Hybrid + Metadata ({MODEL_NAME}) ===")
    print(f"Split: {split} ({len(eval_questions)} answerable/partial questions), k={k}")

    print("Loading local embedding model for query embedding generation...")
    embed_model = TextEmbedding(model_name=MODEL_NAME)

    db_url = get_database_url()
    configs = ["ck256", "ck640"]
    # Pure modes vs explicitly labelled metadata-augmented modes
    retrievers = ["bm25", "embedding", "hybrid", "embedding_plus_metadata", "hybrid_plus_metadata"]

    results: dict[str, Any] = {}

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for ret in retrievers:
                results[ret] = {}
                for cfg in configs:
                    hit_rates, recalls, mrrs, precisions, ndcgs = [], [], [], [], []
                    per_q = []

                    for q in eval_questions:
                        qid = q["question_id"]
                        q_text = q["question"]
                        gold_evidence = q.get("gold_evidence", [])
                        gold_cids = (
                            gold_annotations.get(qid, {})
                            .get("gold_chunk_ids", {})
                            .get(cfg, [])
                        )
                        total_relevant = len(gold_evidence) or 1

                        if ret == "bm25":
                            retrieved = query_bm25(cur, q_text, cfg, k)
                        elif ret == "embedding":
                            q_vec = list(embed_model.embed([q_text]))[0].tolist()
                            retrieved = query_embedding(cur, q_text, q_vec, cfg, k)
                        elif ret == "hybrid":
                            q_vec = list(embed_model.embed([q_text]))[0].tolist()
                            retrieved = query_hybrid_rrf(cur, q_text, q_vec, cfg, k)
                        elif ret == "embedding_plus_metadata":
                            q_vec = list(embed_model.embed([q_text]))[0].tolist()
                            base = query_embedding(cur, q_text, q_vec, cfg, k)
                            meta = query_metadata_lookup(cur, q_text, cfg)
                            retrieved = augment_with_metadata_chunks(base, meta, k)
                        else:
                            q_vec = list(embed_model.embed([q_text]))[0].tolist()
                            base = query_hybrid_rrf(cur, q_text, q_vec, cfg, k)
                            meta = query_metadata_lookup(cur, q_text, cfg)
                            retrieved = augment_with_metadata_chunks(base, meta, k)

                        is_relevant = [
                            is_chunk_relevant(c, gold_evidence, gold_cids) for c in retrieved
                        ]

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
                            "question_id": qid,
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

    out_file = RESULTS_DIR / f"comparison_{split}.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nSaved comparative benchmark results to {out_file}")

    print("\n" + "=" * 96)
    print(f"RETRIEVAL BENCHMARK COMPARISON ({split.upper()} SPLIT, K={k}) — PURE VS METADATA-AUGMENTED")
    print("=" * 96)
    header = (
        f"{'Metric':<14} | {'BM25(640)':<10} | {'Embed(256)':<10} | "
        f"{'Hybrid(256)':<11} | {'Embed+Meta(256)':<15} | {'Hyb+Meta(256)':<13}"
    )
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
        b640 = results["bm25"]["ck640"][key]
        e256 = results["embedding"]["ck256"][key]
        h256 = results["hybrid"]["ck256"][key]
        em256 = results["embedding_plus_metadata"]["ck256"][key]
        hm256 = results["hybrid_plus_metadata"]["ck256"][key]

        if is_pct:
            print(
                f"{name:<14} | {b640*100:>9.1f}% | {e256*100:>9.1f}% | "
                f"{h256*100:>10.1f}% | {em256*100:>14.1f}% | {hm256*100:>12.1f}%"
            )
        else:
            print(
                f"{name:<14} | {b640:>10.3f} | {e256:>10.3f} | "
                f"{h256:>11.3f} | {em256:>15.3f} | {hm256:>13.3f}"
            )

    print("=" * 96)


if __name__ == "__main__":
    run_comparison()
