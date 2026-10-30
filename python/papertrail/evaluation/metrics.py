"""Retrieval evaluation metrics: Recall@K, HitRate@K, MRR, Precision@K, nDCG@K.
Implements formulas from PRD FR-EVL-03 and TRD §10.B.
"""

import math


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
