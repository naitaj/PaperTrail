"""Unit tests for retrieval evaluation metrics."""

import pytest

from papertrail.evaluation.metrics import (
    compute_hit_rate,
    compute_mrr,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_recall_at_k,
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
