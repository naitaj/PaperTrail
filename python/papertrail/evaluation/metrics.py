"""Retrieval and end-to-end RAG evaluation metrics:
- Retrieval: Recall@K, HitRate@K, MRR, Precision@K, nDCG@K (PRD FR-EVL-03, TRD §10.B)
- Abstention: Precision, Recall, F1, False-Answer Rate, False-Abstention Rate
- Faithfulness & Citations: Claim Faithfulness Rate, Citation Precision, Citation Coverage, Answer Fact Recall
"""

import math
import re
from typing import Any

from papertrail.evaluation.citations import STOPWORDS, claim_support_ratio, tokenize_alnum


def compute_hit_rate(is_relevant: list[bool], k: int) -> float:
    """1.0 if any relevant chunk is within top-k, else 0.0."""
    return 1.0 if any(is_relevant[:k]) else 0.0


def compute_recall_at_k(is_relevant: list[bool], total_relevant: int, k: int) -> float:
    """Fraction of relevant items retrieved in top-k."""
    if total_relevant == 0:
        return 1.0
    retrieved_rel = sum(1 for rel in is_relevant[:k] if rel)
    return min(1.0, retrieved_rel / total_relevant)


def compute_mrr(is_relevant: list[bool]) -> float:
    """Reciprocal rank of the first relevant chunk."""
    for rank, rel in enumerate(is_relevant, 1):
        if rel:
            return 1.0 / rank
    return 0.0


def compute_precision_at_k(is_relevant: list[bool], k: int) -> float:
    """Fraction of top-k retrieved items that are relevant."""
    if k == 0:
        return 0.0
    return sum(1 for rel in is_relevant[:k] if rel) / float(k)


def compute_ndcg_at_k(is_relevant: list[bool], total_relevant: int, k: int) -> float:
    """Normalized Discounted Cumulative Gain at K."""
    if total_relevant == 0:
        return 1.0

    dcg = 0.0
    for i, rel in enumerate(is_relevant[:k]):
        if rel:
            dcg += 1.0 / math.log2(i + 2)

    idcg = sum(1.0 / math.log2(i + 2) for i in range(min(k, total_relevant)))
    if idcg == 0.0:
        return 0.0

    return dcg / idcg


def should_abstain_ground_truth(question: dict[str, Any]) -> bool:
    """True when the question's ground-truth answerability requires abstention."""
    ans = str(question.get("answerability", "")).lower()
    cat = str(question.get("category", "")).lower()
    return ans in ("unanswerable", "out_of_corpus") or cat in (
        "unanswerable_in_domain",
        "out_of_corpus",
        "ambiguous",
    )


def compute_abstention_metrics(
    outcomes: list[tuple[bool, bool]],
) -> dict[str, float]:
    """Compute full binary confusion metrics for abstention.

    Each element of `outcomes` is `(should_abstain_gt, did_abstain_pred)`.
    - TP: should abstain AND did abstain
    - FP: should NOT abstain (answerable/partial) BUT did abstain (false abstention)
    - FN: should abstain BUT did NOT abstain (false answer / hallucination on unanswerable)
    - TN: should NOT abstain AND did NOT abstain
    """
    tp = sum(1 for gt, pred in outcomes if gt and pred)
    fp = sum(1 for gt, pred in outcomes if (not gt) and pred)
    fn = sum(1 for gt, pred in outcomes if gt and (not pred))
    tn = sum(1 for gt, pred in outcomes if (not gt) and (not pred))

    total_should_abstain = tp + fn
    total_answerable = tn + fp
    total = len(outcomes)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / total_should_abstain if total_should_abstain > 0 else 1.0
    f1 = (
        2.0 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    false_answer_rate = fn / total_should_abstain if total_should_abstain > 0 else 0.0
    false_abstention_rate = fp / total_answerable if total_answerable > 0 else 0.0
    overall_accuracy = (tp + tn) / total if total > 0 else 1.0

    return {
        "abstention_precision": round(precision * 100.0, 1),
        "abstention_recall": round(recall * 100.0, 1),
        "abstention_f1": round(f1 * 100.0, 1),
        "abstention_accuracy": round(recall * 100.0, 1),
        "overall_decision_accuracy": round(overall_accuracy * 100.0, 1),
        "false_answer_rate": round(false_answer_rate * 100.0, 1),
        "false_abstention_rate": round(false_abstention_rate * 100.0, 1),
    }


def compute_citation_coverage(answer_text: str, verified_claims_count: int) -> float:
    """Measure the ratio of substantive sentences in `answer_text` backed by verified claims."""
    if not answer_text or not answer_text.strip():
        return 0.0
    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.!?])\s+", answer_text.strip())
        if len(s.strip()) >= 15
    ]
    if not sentences:
        return 1.0 if verified_claims_count > 0 else 0.0
    return min(1.0, verified_claims_count / float(len(sentences)))


def compute_answer_fact_recall(
    answer_text: str, reference_answer: str | None
) -> float:
    """Measure content-token recall of `reference_answer` covered by `answer_text`."""
    if not reference_answer:
        return 1.0
    ref_tokens = [
        t for t in tokenize_alnum(reference_answer) if len(t) >= 3 and t not in STOPWORDS
    ]
    if not ref_tokens:
        return 1.0
    ans_tokens = set(tokenize_alnum(answer_text or ""))
    if not ans_tokens:
        return 0.0

    matched = 0
    for rt in ref_tokens:
        if rt in ans_tokens:
            matched += 1
            continue
        if len(rt) >= 5:
            stem = rt[: min(len(rt) - 1, 6)]
            if any(len(at) >= 4 and at.startswith(stem) for at in ans_tokens):
                matched += 1
    return matched / float(len(ref_tokens))


def compute_gold_claim_support(
    kept_claims: list[dict[str, Any]],
    gold_evidence: list[dict[str, Any]],
    gold_chunk_ids: list[str] | None = None,
    reference_answer: str | None = None,
) -> dict[str, float]:
    """Evaluate verified claims against manually verified gold evidence (Correction #5).

    Separates:
    - `gold_doc_page_citation_rate`: fraction of kept claims whose cited doc_id & page match gold_evidence
      (or whose citation_chunk_id is in verified gold_chunk_ids).
    - `gold_evidence_claim_support_rate`: fraction of kept claims that cite a verified gold source AND
      whose factual content aligns with the gold evidence spans / reference answer.
    """
    if not kept_claims:
        return {
            "gold_doc_page_citation_rate": 0.0,
            "gold_evidence_claim_support_rate": 0.0,
        }

    gold_docs = {g.get("doc_id") for g in gold_evidence if g.get("doc_id")}
    gold_doc_pages = {
        (g.get("doc_id"), int(p))
        for g in gold_evidence
        for p in g.get("pages", [])
        if g.get("doc_id")
    }
    gold_cids = set(gold_chunk_ids or [])
    gold_text_corpus = " ".join(
        [str(g.get("span", "")) for g in gold_evidence if g.get("span")]
        + ([reference_answer] if reference_answer else [])
    )

    doc_page_matched = 0
    gold_supported = 0

    for c in kept_claims:
        cid = c.get("citation_chunk_id", "")
        c_doc = c.get("doc_id", "")
        c_page = int(c.get("page", 0) or 0)
        c_text = str(c.get("claim_text", ""))

        is_gold_loc = (
            cid in gold_cids
            or (c_doc, c_page) in gold_doc_pages
            or (c_doc in gold_docs and not gold_doc_pages)
        )
        if is_gold_loc:
            doc_page_matched += 1
            if not gold_text_corpus.strip() or claim_support_ratio(c_text, gold_text_corpus) >= 0.25:
                gold_supported += 1

    n = float(len(kept_claims))
    return {
        "gold_doc_page_citation_rate": doc_page_matched / n,
        "gold_evidence_claim_support_rate": gold_supported / n,
    }

