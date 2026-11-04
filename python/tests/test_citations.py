"""Unit tests for Citation Validation Engine (TRD §7.5, §13.2)."""

from papertrail.evaluation.citations import (
    normalise_text,
    validate_citations,
    window_overlap_ratio,
)


def test_normalise_text():
    raw = "This is a   sentence with  bio-\nlogical hyphenation."
    norm = normalise_text(raw)
    assert norm == "this is a sentence with biological hyphenation."


def test_window_overlap_ratio():
    haystack = "The quick brown fox jumps over the lazy dog."
    needle = "brown fox jumps"
    assert window_overlap_ratio(haystack, needle) == 1.0

    needle_imperfect = "quick brown wolf jumps"
    # 3 out of 4 tokens match
    assert window_overlap_ratio(haystack, needle_imperfect) == 0.75


def test_valid_citation_exact_quote():
    context = [
        {
            "chunk_id": "doc1_ck256_001",
            "doc_id": "doc1",
            "page_start": 2,
            "text": "The transformer architecture relies entirely on self-attention mechanisms to compute representations.",
        }
    ]
    raw_claims = [
        {
            "claim_text": "Transformers rely entirely on self-attention mechanisms.",
            "citation_chunk_id": "doc1_ck256_001",
            "evidence_quote": "relies entirely on self-attention mechanisms",
        }
    ]

    result = validate_citations(raw_claims, context, original_decision="answerable")
    assert result["decision"] == "answerable"
    assert len(result["kept_claims"]) == 1
    assert len(result["removed_claims"]) == 0
    assert result["diagnostics"]["kept_claims_count"] == 1


def test_removed_no_valid_citation():
    context = [
        {
            "chunk_id": "doc1_ck256_001",
            "doc_id": "doc1",
            "page_start": 1,
            "text": "Some text here.",
        }
    ]
    raw_claims = [
        {
            "claim_text": "A claim citing an invented chunk.",
            "citation_chunk_id": "hallucinated_chunk_999",
            "evidence_quote": "Some quote",
        }
    ]

    result = validate_citations(raw_claims, context, original_decision="answerable")
    # All claims removed -> downgraded to abstain
    assert result["decision"] == "abstain"
    assert len(result["kept_claims"]) == 0
    assert len(result["removed_claims"]) == 1
    assert result["removed_claims"][0]["reason"] == "REMOVED_NO_VALID_CITATION"
    assert result["diagnostics"]["decision_downgraded"] is True


def test_removed_quote_not_found():
    context = [
        {
            "chunk_id": "doc1_ck256_001",
            "doc_id": "doc1",
            "page_start": 1,
            "text": "PostgreSQL provides pgvector for vector similarity operations.",
        }
    ]
    raw_claims = [
        {
            "claim_text": "PostgreSQL supports vectors.",
            "citation_chunk_id": "doc1_ck256_001",
            "evidence_quote": "Completely fabricated quote about neural nets",
        }
    ]

    result = validate_citations(raw_claims, context, original_decision="answerable")
    assert result["decision"] == "abstain"
    assert len(result["removed_claims"]) == 1
    assert result["removed_claims"][0]["reason"] == "REMOVED_QUOTE_NOT_FOUND"


def test_status_downgrade_to_partial():
    context = [
        {
            "chunk_id": "chunk_A",
            "doc_id": "doc1",
            "page_start": 1,
            "text": "PaperTrail supports exact BM25 lexical search.",
        }
    ]
    raw_claims = [
        {
            "claim_text": "Valid claim",
            "citation_chunk_id": "chunk_A",
            "evidence_quote": "supports exact BM25",
        },
        {
            "claim_text": "Invalid claim",
            "citation_chunk_id": "chunk_A",
            "evidence_quote": "invented quote that is absent",
        },
    ]

    result = validate_citations(raw_claims, context, original_decision="answerable")
    # One kept, one removed -> downgraded from answerable to partial
    assert result["decision"] == "partial"
    assert len(result["kept_claims"]) == 1
    assert len(result["removed_claims"]) == 1
    assert result["diagnostics"]["decision_downgraded"] is True

