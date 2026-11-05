"""Unit tests for retrieval and abstention evaluation metrics."""

import pytest

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


def test_hit_rate():
    assert compute_hit_rate([False, True, False], k=3) == 1.0
    assert compute_hit_rate([False, False, False], k=3) == 0.0
    assert compute_hit_rate([False, False, True], k=2) == 0.0


def test_mrr():
    assert compute_mrr([True, False, False]) == 1.0
    assert compute_mrr([False, True, False]) == 0.5
    assert compute_mrr([False, False, True]) == pytest.approx(1.0 / 3.0)
    assert compute_mrr([False, False, False]) == 0.0


def test_recall_at_k():
    assert compute_recall_at_k([True, False, True], total_relevant=2, k=3) == 1.0
    assert compute_recall_at_k([True, False, False], total_relevant=2, k=3) == 0.5
    assert compute_recall_at_k([False, False, False], total_relevant=2, k=3) == 0.0


def test_precision_at_k():
    assert compute_precision_at_k([True, False, False], k=3) == pytest.approx(1.0 / 3.0)
    assert compute_precision_at_k([True, True, False], k=2) == 1.0


def test_ndcg_at_k():
    # Ideal ranking: first item is relevant
    assert compute_ndcg_at_k([True, False, False], total_relevant=1, k=3) == 1.0
    # Second item is relevant
    assert compute_ndcg_at_k([False, True, False], total_relevant=1, k=3) < 1.0
    assert compute_ndcg_at_k([False, False, False], total_relevant=1, k=3) == 0.0


def test_should_abstain_ground_truth():
    assert should_abstain_ground_truth({"answerability": "unanswerable", "category": "unanswerable_in_domain"}) is True
    assert should_abstain_ground_truth({"answerability": "out_of_corpus", "category": "out_of_corpus"}) is True
    assert should_abstain_ground_truth({"answerability": "unanswerable", "category": "ambiguous"}) is True
    assert should_abstain_ground_truth({"answerability": "answerable", "category": "direct_factual"}) is False
    assert should_abstain_ground_truth({"answerability": "partial", "category": "partially_answerable"}) is False


def test_abstention_metrics():
    # 2 should-abstain (both abstained -> TP=2, FN=0)
    # 2 answerable (1 answered, 1 falsely abstained -> TN=1, FP=1)
    outcomes = [(True, True), (True, True), (False, False), (False, True)]
    m = compute_abstention_metrics(outcomes)
    assert m["abstention_recall"] == 100.0
    assert m["abstention_precision"] == pytest.approx(66.7, abs=0.1)
    assert m["false_answer_rate"] == 0.0
    assert m["false_abstention_rate"] == 50.0


def test_citation_coverage_and_fact_recall():
    ans = "DPR uses two BERT encoders for dense retrieval. It trains them with negative log-likelihood loss."
    assert compute_citation_coverage(ans, 2) == 1.0
    assert compute_citation_coverage(ans, 1) == 0.5
    ref = "DPR uses two independent BERT encoders trained with negative log-likelihood loss."
    assert compute_answer_fact_recall(ans, ref) >= 0.75


def test_compute_gold_claim_support():
    gold_evidence = [
        {"doc_id": "lewis-2020-rag", "pages": [2], "span": "RAG-Sequence uses the same document to predict each target token."}
    ]
    gold_cids = ["lewis-2020-rag:ck256:p2:c3"]
    kept_claims = [
        {
            "claim_text": "RAG-Sequence uses the same retrieved document across all target tokens.",
            "citation_chunk_id": "lewis-2020-rag:ck256:p2:c3",
            "doc_id": "lewis-2020-rag",
            "page": 2,
            "evidence_quote": "RAG-Sequence uses the same document to predict each target token.",
        },
        {
            "claim_text": "Unrelated claim citing a non-gold document.",
            "citation_chunk_id": "other-doc:ck256:p1:c0",
            "doc_id": "other-doc",
            "page": 1,
            "evidence_quote": "Some quote.",
        },
    ]
    res = compute_gold_claim_support(kept_claims, gold_evidence, gold_cids)
    assert res["gold_doc_page_citation_rate"] == pytest.approx(0.5)
    assert res["gold_evidence_claim_support_rate"] == pytest.approx(0.5)

