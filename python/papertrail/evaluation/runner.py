"""End-to-End Evaluation Runner (TRD §10, §16 Day 4).

Executes automated end-to-end evaluation on dev or test split:
- Unifies SQL queries, gate thresholds (from data/thresholds/gate.json), prompt structure,
  and citation validation with the production TypeScript pipeline.
- Evaluates BM25, Dense Embedding, and Hybrid RRF retrieval + Groq generation +
  full abstention confusion metrics (precision, recall, F1, false-answer rate, false-abstention rate).
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import psycopg
from fastembed import TextEmbedding

from papertrail.common.config import RESULTS_DIR, get_database_url
from papertrail.evaluation.citations import validate_citations
from papertrail.evaluation.compare_retrieval import (
    MODEL_NAME,
    augment_with_metadata_chunks,
    query_bm25,
    query_embedding,
    query_hybrid_rrf,
    query_metadata_lookup,
)
from papertrail.evaluation.dataset import (
    is_chunk_relevant,
    load_eval_split,
    load_gold_annotations,
)
from papertrail.evaluation.metrics import (
    compute_abstention_metrics,
    compute_answer_fact_recall,
    compute_citation_coverage,
    compute_gold_claim_support,
    compute_hit_rate,
    compute_mrr,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_recall_at_k,
    should_abstain_ground_truth,
)

ROOT_DIR = Path(__file__).resolve().parents[3]
GATE_JSON_PATH = ROOT_DIR / "data" / "thresholds" / "gate.json"


def load_gate_thresholds() -> dict[str, dict[str, float]]:
    if GATE_JSON_PATH.exists():
        with open(GATE_JSON_PATH, encoding="utf-8") as f:
            data = json.load(f)
            return data.get("thresholds", {})
    return {
        "bm25": {"ck640": 11.0, "ck256": 11.0},
        "embedding": {"ck640": 0.35, "ck256": 0.35},
    }


def evaluate_gate(
    retrieved: list[dict[str, Any]],
    retriever: str,
    chunk_config: str,
    thresholds: dict[str, dict[str, float]],
) -> tuple[bool, str | None]:
    """Evaluate abstention gate prior to model generation (mirrors web/src/lib/abstention/gate.ts)."""
    if not retrieved:
        return True, "insufficient_evidence: zero matching passages"

    if any(c.get("retriever_source") == "metadata" for c in retrieved):
        return False, None

    top = retrieved[0]
    if retriever in ("hybrid", "hybrid_plus_metadata"):
        dense_thresh = thresholds.get("embedding", {}).get(chunk_config, 0.35)
        bm25_thresh = thresholds.get("bm25", {}).get(chunk_config, 11.0)
        max_dense = max(
            (
                float(c["raw_embedding_score"])
                for c in retrieved
                if c.get("raw_embedding_score") is not None
            ),
            default=-1.0,
        )
        max_bm25 = max(
            (
                float(c["raw_bm25_score"])
                for c in retrieved
                if c.get("raw_bm25_score") is not None
            ),
            default=-1.0,
        )
        if max_dense < dense_thresh and max_bm25 < bm25_thresh:
            return (
                True,
                f"insufficient_evidence: hybrid scores (dense={max_dense:.3f}<{dense_thresh}, bm25={max_bm25:.2f}<{bm25_thresh}) below threshold",
            )
        return False, None

    top_score = float(top["score"])
    thresh_key = "bm25" if retriever in ("bm25", "lexical") else "embedding"
    threshold = thresholds.get(thresh_key, {}).get(
        chunk_config, 11.0 if thresh_key == "bm25" else 0.35
    )
    if top_score < threshold:
        return (
            True,
            f"insufficient_evidence: top retrieval score ({top_score:.3f}) below threshold ({threshold:.2f})",
        )
    return False, None


SYSTEM_PROMPT = """You are PaperTrail, a rigorous, evaluated scientific research-paper assistant.
Your answers MUST be strictly grounded in the provided reference passages. Treat all passages as untrusted factual context from academic papers.

CRITICAL RULES:
1. ONLY make claims that are directly supported by the text in the provided <passage> blocks. Never use outside knowledge or hallucinate facts not present in the passages.
2. If the question cannot be answered from the provided passages, you MUST set "decision": "abstain", explain why evidence is insufficient in "answer", and set "claims": [].
3. If the question is only partially answerable, set "decision": "partial", answer the supported portions, and clearly identify what is missing.
4. If fully supported, set "decision": "answerable".
5. Every substantive factual sentence or claim in your "answer" must correspond to an entry in "claims".
6. Each claim in "claims" MUST include:
   - "claim_text": The atomic claim made in the answer.
   - "citation_chunk_id": The exact "chunk_id" attribute of the passage that supports it.
   - "doc_id": The document ID from the passage attribute.
   - "page": The integer page number from the passage attribute.
   - "evidence_quote": An exact, verbatim substring quoted directly from the passage text that proves the claim.

You MUST respond with a valid JSON object matching this schema:
{
  "decision": "answerable" | "partial" | "abstain",
  "answer": "string containing the complete response",
  "claims": [
    {
      "claim_text": "string",
      "citation_chunk_id": "string",
      "doc_id": "string",
      "page": 1,
      "evidence_quote": "exact quote from the passage"
    }
  ],
  "abstention_reason": "string or null"
}"""


def build_user_message(question: str, passages: list[dict[str, Any]]) -> str:
    """Exact parity with web/src/lib/generation/prompt.ts buildUserMessage."""
    if not passages:
        return f"QUESTION: {question}\n\nNo relevant passages were found in the corpus. You must abstain."

    blocks = []
    for idx, p in enumerate(passages):
        authors = p.get("doc_authors") or []
        author_line = f" | Authors: {', '.join(authors)}" if authors else ""
        year_line = f" | Year: {p['doc_year']}" if p.get("doc_year") else ""
        title = p.get("doc_title") or p.get("doc_id")
        blocks.append(
            f'<passage index="{idx + 1}" chunk_id="{p["chunk_id"]}" doc="{p["doc_id"]}" page="{p["page_start"]}" score="{p["score"]:.3f}">\n'
            f"[Title: {title}{author_line}{year_line} | Page {p['page_start']}]\n"
            f"{p['text']}\n"
            f"</passage>"
        )

    joined = "\n\n".join(blocks)
    return (
        f"Here are the retrieved reference passages from the scientific corpus:\n\n"
        f"{joined}\n\n"
        f"QUESTION:\n{question}\n\n"
        f"Provide your grounded analysis in the requested JSON structure."
    )


_EXHAUSTED_MODELS: set[str] = set()


_MODEL_INDEX = 0


def call_groq_generation(
    question: str,
    passages: list[dict[str, Any]],
    groq_api_key: str,
    primary_model: str = "openai/gpt-oss-120b",
    fallback_model: str = "openai/gpt-oss-20b",
    tertiary_model: str = "qwen/qwen3.8-27b",
) -> dict[str, Any]:
    """Call Groq API directly using the production prompt and structured JSON schema."""
    global _MODEL_INDEX
    user_prompt = build_user_message(question, passages)
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json",
    }

    pool = [
        m for m in (primary_model, fallback_model, tertiary_model)
        if m not in _EXHAUSTED_MODELS
    ] or [primary_model, fallback_model]
    start_idx = _MODEL_INDEX % len(pool)
    _MODEL_INDEX += 1
    models_to_try = pool[start_idx:] + pool[:start_idx]

    for model in models_to_try:
        for attempt in range(2):
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 900,
                    "response_format": {"type": "json_object"},
                }
                with httpx.Client(timeout=20.0) as client:
                    res = client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    if res.status_code == 200:
                        rem_tok = int(res.headers.get("x-ratelimit-remaining-tokens", "8000") or 8000)
                        if rem_tok < 1800:
                            time.sleep(1.5)
                        data = res.json()
                        content = data["choices"][0]["message"]["content"]
                        parsed = json.loads(content)
                        return {
                            "parsed": parsed,
                            "model": model,
                            "usage": data.get("usage"),
                        }
                    if res.status_code == 429:
                        err_msg = res.text.lower()
                        if "tokens per day" in err_msg or "tpd" in err_msg:
                            _EXHAUSTED_MODELS.add(model)
                            break  # Daily quota reached for this model; permanently skip it
                        time.sleep(2.5)
                        break  # Rotate to next model on per-minute 429
                    if res.status_code in (500, 502, 503):
                        time.sleep(1.5)
                        continue
            except Exception:
                time.sleep(1.0)
                continue

    return {
        "parsed": {
            "decision": "abstain",
            "answer": "Model failed to produce valid response.",
            "claims": [],
            "abstention_reason": "API generation timeout or error",
        },
        "model": "fallback",
        "usage": None,
    }


def run_dev_evaluation(split: str = "dev", k: int = 5, run_generation: bool = True):
    print("=" * 75)
    print(f"=== PaperTrail End-to-End Evaluation Runner ({split.upper()} SPLIT, K={k}) ===")
    print("=" * 75)

    questions = load_eval_split(split)
    gold_annotations = load_gold_annotations()
    thresholds = load_gate_thresholds()

    answerable_qs = [q for q in questions if not should_abstain_ground_truth(q)]
    abstain_qs = [q for q in questions if should_abstain_ground_truth(q)]

    print(f"Total questions in {split}: {len(questions)}")
    print(f" - Answerable/partial: {len(answerable_qs)}")
    print(f" - Should-abstain (unanswerable + out_of_corpus + ambiguous): {len(abstain_qs)}")

    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_api_key:
        print("[WARNING] GROQ_API_KEY not found in environment; generation evaluation will be simulated.")
        run_generation = False

    print("Loading local embedding model (all-MiniLM-L6-v2)...")
    embed_model = TextEmbedding(model_name=MODEL_NAME)
    db_url = get_database_url()

    eval_matrix = [
        ("bm25", "ck256"),
        ("bm25", "ck640"),
        ("embedding", "ck256"),
        ("embedding", "ck640"),
        ("hybrid", "ck256"),
        ("embedding_plus_metadata", "ck256"),
        ("hybrid_plus_metadata", "ck256"),
    ]

    results: dict[str, Any] = {
        "split": split,
        "k": k,
        "total_questions": len(questions),
        "answerable_questions": len(answerable_qs),
        "should_abstain_questions": len(abstain_qs),
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "configurations": {},
    }

    # Precompute 384-d query embeddings once per question
    query_vectors: dict[str, list[float]] = {
        q["question_id"]: list(embed_model.embed([q["question"]]))[0].tolist()
        for q in questions
    }

    # Cache Groq generation by (question_id, tuple_of_chunk_ids) so identical top-5 retrieved sets
    # (e.g., between pure mode and metadata-augmented mode on non-author questions) reuse the exact generation
    generation_cache: dict[tuple[str, tuple[str, ...]], tuple[dict[str, Any], float]] = {}

    for ret, cfg in eval_matrix:
        cfg_key = f"{ret}_{cfg}"
        print(f"\nEvaluating configuration: {cfg_key} ...", flush=True)

        hit_rates, recalls, mrrs, precisions, ndcgs = [], [], [], [], []
        abstention_outcomes: list[tuple[bool, bool]] = []
        citation_coverages: list[float] = []
        fact_recalls: list[float] = []
        gold_doc_page_rates: list[float] = []
        gold_claim_support_rates: list[float] = []
        total_claims = 0
        kept_claims_count = 0
        citation_existence_passed_total = 0
        quote_exact_match_total = 0
        quote_contiguous_overlap_total = 0
        heuristic_lexical_overlap_passed_total = 0
        downgraded_count = 0
        latencies = []
        per_question_log = []

        # Step 1: Retrieve for all questions in this configuration using a fresh DB connection
        retrieved_by_qid: dict[str, tuple[list[dict[str, Any]], float]] = {}
        with psycopg.connect(db_url, connect_timeout=15) as conn:
            with conn.cursor() as cur:
                for q in questions:
                    q_id = q["question_id"]
                    q_text = q["question"]
                    q_vec = query_vectors[q_id]
                    t0 = time.time()
                    if ret == "bm25":
                        retrieved = query_bm25(cur, q_text, cfg, k)
                    elif ret == "embedding":
                        retrieved = query_embedding(cur, q_text, q_vec, cfg, k)
                    elif ret == "hybrid":
                        retrieved = query_hybrid_rrf(cur, q_text, q_vec, cfg, k)
                    elif ret == "embedding_plus_metadata":
                        base = query_embedding(cur, q_text, q_vec, cfg, k)
                        meta = query_metadata_lookup(cur, q_text, cfg)
                        retrieved = augment_with_metadata_chunks(base, meta, k)
                    else:
                        base = query_hybrid_rrf(cur, q_text, q_vec, cfg, k)
                        meta = query_metadata_lookup(cur, q_text, cfg)
                        retrieved = augment_with_metadata_chunks(base, meta, k)
                    t_retrieval = time.time() - t0
                    retrieved_by_qid[q_id] = (retrieved, t_retrieval)
        print(f"  [Retrieval complete for {cfg_key}: {len(retrieved_by_qid)} questions]", flush=True)

        # Step 2: Compute retrieval metrics and run Groq generation (outside DB connection)
        for idx_q, q in enumerate(questions, 1):
            q_id = q["question_id"]
            q_text = q["question"]
            gt_should_abstain = should_abstain_ground_truth(q)
            gold_evidence = q.get("gold_evidence", [])
            gold_cids = (
                gold_annotations.get(q_id, {})
                .get("gold_chunk_ids", {})
                .get(cfg, [])
            )
            total_rel = len(gold_evidence) or 1
            retrieved, t_retrieval = retrieved_by_qid[q_id]

            if not gt_should_abstain:
                is_rel = [
                    is_chunk_relevant(c, gold_evidence, gold_cids)
                    for c in retrieved
                ]
                hr = compute_hit_rate(is_rel, k)
                rec = compute_recall_at_k(is_rel, total_rel, k)
                mrr = compute_mrr(is_rel)
                prec = compute_precision_at_k(is_rel, k)
                ndcg = compute_ndcg_at_k(is_rel, total_rel, k)

                hit_rates.append(hr)
                recalls.append(rec)
                mrrs.append(mrr)
                precisions.append(prec)
                ndcgs.append(ndcg)

            gen_output = None
            t_gen = 0.0
            if run_generation:
                t_g0 = time.time()
                should_gate, gate_reason = evaluate_gate(
                    retrieved, ret, cfg, thresholds
                )

                if should_gate:
                    t_gen = time.time() - t_g0
                    final_decision = "abstain"
                    gen_output = {
                        "model": "abstention-gate",
                        "decision": "abstain",
                        "original_decision": "abstain",
                        "downgraded": False,
                        "gate_triggered": True,
                        "kept_claims": 0,
                        "total_claims": 0,
                        "answer": f"Abstained by confidence gate: {gate_reason}",
                    }
                    abstention_outcomes.append((gt_should_abstain, True))
                else:
                    cache_key = (q_id, tuple(c["chunk_id"] for c in retrieved))
                    if cache_key in generation_cache:
                        gen_res, t_gen = generation_cache[cache_key]
                    else:
                        gen_res = call_groq_generation(
                            q_text, retrieved, groq_api_key
                        )
                        t_gen = time.time() - t_g0
                        generation_cache[cache_key] = (gen_res, t_gen)
                        print(f"    [{cfg_key} {idx_q}/{len(questions)}] {q_id} -> model={gen_res['model']} ({t_gen:.1f}s)", flush=True)
                    parsed = gen_res["parsed"]

                    raw_claims = parsed.get("claims", [])
                    raw_decision = parsed.get("decision", "answerable")
                    answer_str = str(parsed.get("answer", ""))

                    val_res = validate_citations(
                        raw_claims,
                        retrieved,
                        raw_decision,
                        strict_mode=True,
                    )
                    final_decision = val_res["decision"]
                    did_abstain = final_decision == "abstain"
                    abstention_outcomes.append(
                        (gt_should_abstain, did_abstain)
                    )

                    diag = val_res["diagnostics"]
                    kept_cnt = len(val_res["kept_claims"])
                    raw_cnt = len(raw_claims)
                    total_claims += raw_cnt
                    kept_claims_count += kept_cnt
                    citation_existence_passed_total += diag.get("citation_existence_passed", 0)
                    quote_exact_match_total += diag.get("quote_exact_match_count", 0)
                    quote_contiguous_overlap_total += diag.get("quote_contiguous_overlap_count", 0)
                    heuristic_lexical_overlap_passed_total += diag.get("heuristic_lexical_overlap_passed", 0)
                    if diag["decision_downgraded"]:
                        downgraded_count += 1

                    if not did_abstain:
                        citation_coverages.append(
                            compute_citation_coverage(answer_str, kept_cnt)
                        )
                    if not gt_should_abstain and not did_abstain:
                        fact_recalls.append(
                            compute_answer_fact_recall(
                                answer_str, q.get("reference_answer")
                            )
                        )
                        gold_sup = compute_gold_claim_support(
                            val_res["kept_claims"],
                            gold_evidence,
                            gold_cids,
                            q.get("reference_answer"),
                        )
                        gold_doc_page_rates.append(gold_sup["gold_doc_page_citation_rate"])
                        gold_claim_support_rates.append(gold_sup["gold_evidence_claim_support_rate"])

                    gen_output = {
                        "model": gen_res["model"],
                        "decision": final_decision,
                        "original_decision": raw_decision,
                        "downgraded": diag["decision_downgraded"],
                        "gate_triggered": False,
                        "kept_claims": kept_cnt,
                        "total_claims": raw_cnt,
                        "diagnostics": diag,
                        "answer": answer_str[:160],
                    }

            latencies.append(t_retrieval + t_gen)
            per_question_log.append({
                "question_id": q_id,
                "category": q["category"],
                "answerability": q["answerability"],
                "should_abstain_gt": gt_should_abstain,
                "retrieval_time_ms": round(t_retrieval * 1000, 1),
                "gen_time_ms": round(t_gen * 1000, 1),
                "retrieved_count": len(retrieved),
                "top_score": round(retrieved[0]["score"], 4) if retrieved else 0.0,
                "generation": gen_output,
            })

        mean_hr = sum(hit_rates) / len(hit_rates) if hit_rates else 0.0
        mean_rec = sum(recalls) / len(recalls) if recalls else 0.0
        mean_mrr = sum(mrrs) / len(mrrs) if mrrs else 0.0
        mean_prec = sum(precisions) / len(precisions) if precisions else 0.0
        mean_ndcg = sum(ndcgs) / len(ndcgs) if ndcgs else 0.0

        citation_existence_rate = (
            (citation_existence_passed_total / total_claims * 100.0)
            if total_claims > 0
            else 100.0
        )
        quote_verification_rate = (
            ((quote_exact_match_total + quote_contiguous_overlap_total) / total_claims * 100.0)
            if total_claims > 0
            else 100.0
        )
        heuristic_lexical_overlap_rate = (
            (heuristic_lexical_overlap_passed_total / total_claims * 100.0)
            if total_claims > 0
            else 100.0
        )
        citation_precision = (
            (kept_claims_count / total_claims * 100.0)
            if total_claims > 0
            else 100.0
        )
        mean_cit_cov = (
            sum(citation_coverages) / len(citation_coverages) * 100.0
            if citation_coverages
            else 100.0
        )
        mean_fact_rec = (
            sum(fact_recalls) / len(fact_recalls) * 100.0
            if fact_recalls
            else 0.0
        )
        mean_gold_doc_page = (
            sum(gold_doc_page_rates) / len(gold_doc_page_rates) * 100.0
            if gold_doc_page_rates
            else 0.0
        )
        mean_gold_claim_sup = (
            sum(gold_claim_support_rates) / len(gold_claim_support_rates) * 100.0
            if gold_claim_support_rates
            else 0.0
        )
        abs_metrics = compute_abstention_metrics(abstention_outcomes)
        avg_latency_ms = (
            (sum(latencies) / len(latencies) * 1000.0) if latencies else 0.0
        )

        results["configurations"][cfg_key] = {
            "retriever": ret,
            "chunk_config": cfg,
            "is_metadata_augmented": ret.endswith("_plus_metadata"),
            "retrieval": {
                "HitRate@5": round(mean_hr * 100.0, 1),
                "Recall@5": round(mean_rec * 100.0, 1),
                "MRR": round(mean_mrr, 3),
                "Precision@5": round(mean_prec * 100.0, 1),
                "nDCG@5": round(mean_ndcg, 3),
            },
            "generation": {
                "total_claims": total_claims,
                "verified_claims": kept_claims_count,
                "citation_existence_rate": round(citation_existence_rate, 1),
                "quote_verification_rate": round(quote_verification_rate, 1),
                "quote_exact_match_count": quote_exact_match_total,
                "quote_contiguous_overlap_count": quote_contiguous_overlap_total,
                "heuristic_lexical_overlap_rate": round(heuristic_lexical_overlap_rate, 1),
                "citation_verbatim_precision": round(citation_precision, 1),
                "gold_doc_page_citation_rate": round(mean_gold_doc_page, 1),
                "gold_evidence_claim_support_rate": round(mean_gold_claim_sup, 1),
                "claim_faithfulness_rate": round(mean_gold_claim_sup, 1),
                "citation_coverage": round(mean_cit_cov, 1),
                "answer_fact_recall": round(mean_fact_rec, 1),
                "status_downgrades": downgraded_count,
                **abs_metrics,
                "avg_latency_ms": round(avg_latency_ms, 1),
            },
            "per_question": per_question_log,
        }

    out_file = RESULTS_DIR / f"eval_{split}_benchmark.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nEvaluation complete! Saved full report to {out_file}")

    print("\n" + "=" * 105)
    print(f"BENCHMARK SUMMARY ({split.upper()} SPLIT, {len(questions)} QUESTIONS)")
    print("=" * 105)
    print(
        f"{'Configuration':<16} | {'HitRate@5':<9} | {'Recall@5':<8} | {'MRR':<6} | "
        f"{'Cit Prec':<8} | {'Abst Rec':<8} | {'Abst F1':<8} | {'FalseAbs':<8} | {'Latency':<8}"
    )
    print("-" * 105)

    for cfg_key, data in results["configurations"].items():
        ret = data["retrieval"]
        gen = data["generation"]
        print(
            f"{cfg_key:<16} | {ret['HitRate@5']:>8.1f}% | {ret['Recall@5']:>7.1f}% | {ret['MRR']:>6.3f} | "
            f"{gen['citation_verbatim_precision']:>7.1f}% | {gen['abstention_recall']:>7.1f}% | "
            f"{gen['abstention_f1']:>7.1f}% | {gen['false_abstention_rate']:>7.1f}% | {gen['avg_latency_ms']:>6.0f}ms"
        )
    print("=" * 105)


if __name__ == "__main__":
    target_split = sys.argv[1] if len(sys.argv) > 1 else "dev"
    run_dev_evaluation(split=target_split)
