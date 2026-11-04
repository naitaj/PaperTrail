"""Citation validation engine for PaperTrail (TRD §7.5, FR-CIT-01..05).

Validates model claims against retrieved context chunks:
1. Every claim must cite a chunk present in the retrieved context set.
2. The evidence quote must exist verbatim (or high token-overlap) in the cited chunk.
3. Automatically downgrades response decision to 'partial' or 'abstain' when claims fail.
"""

import re
from typing import Any


def normalise_text(text: str) -> str:
    """Normalise text by lowercasing, collapsing whitespace, and fixing line-end hyphens."""
    if not text:
        return ""
    text = text.lower()
    # Fix line-end hyphenation
    text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1\2", text)
    # Collapse any whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def window_overlap_ratio(haystack: str, needle: str) -> float:
    """Calculate token-level overlap ratio between needle and haystack."""
    norm_haystack = normalise_text(haystack)
    norm_needle = normalise_text(needle)

    if not norm_needle:
        return 0.0
    if norm_needle in norm_haystack:
        return 1.0

    needle_tokens = [t for t in norm_needle.split(" ") if t]
    if not needle_tokens:
        return 0.0

    haystack_tokens = set(t for t in norm_haystack.split(" ") if t)
    matched = sum(1 for t in needle_tokens if t in haystack_tokens)
    return matched / len(needle_tokens)


def validate_citations(
    raw_claims: list[dict[str, Any]],
    context_chunks: list[dict[str, Any]],
    original_decision: str = "answerable",
    strict_mode: bool = True,
) -> dict[str, Any]:
    """Validate claims and evidence quotes against retrieved context chunks."""
    chunk_map = {c["chunk_id"]: c for c in context_chunks if "chunk_id" in c}

    kept_claims = []
    removed_claims = []

    removed_no_valid_citation = 0
    removed_quote_not_found = 0

    for claim in raw_claims:
        claim_text = str(claim.get("claim_text", "")).strip()
        chunk_id = str(claim.get("citation_chunk_id", "")).strip()
        raw_quote = str(claim.get("evidence_quote", "")).strip()

        if not claim_text:
            continue

        # Rule 1: Chunk must exist in retrieved context
        if not chunk_id or chunk_id not in chunk_map:
            removed_claims.append({
                "claim": claim,
                "reason": "REMOVED_NO_VALID_CITATION",
                "detail": f"Chunk '{chunk_id}' was not in the retrieved context set.",
            })
            removed_no_valid_citation += 1
            continue

        chunk = chunk_map[chunk_id]
        chunk_text = chunk.get("text", "")

        norm_chunk_text = normalise_text(chunk_text)
        norm_quote = normalise_text(raw_quote)

        is_exact = bool(norm_quote and norm_quote in norm_chunk_text)
        overlap = window_overlap_ratio(chunk_text, raw_quote) if norm_quote else 0.0

        quote_verified = False
        final_quote = raw_quote

        if is_exact:
            quote_verified = True
        elif overlap >= 0.85:
            quote_verified = True
            final_quote = raw_quote + " [Note: High-overlap match]"
        elif not strict_mode and norm_quote:
            quote_verified = True
            final_quote = chunk_text[:120] + "..."

        if not quote_verified:
            removed_claims.append({
                "claim": claim,
                "reason": "REMOVED_QUOTE_NOT_FOUND",
                "detail": f"Quote '{raw_quote[:50]}' was not found in chunk {chunk_id}.",
            })
            removed_quote_not_found += 1
            continue

        kept_claims.append({
            "claim_text": claim_text,
            "citation_chunk_id": chunk_id,
            "doc_id": chunk.get("doc_id", ""),
            "page": chunk.get("page_start", 1),
            "evidence_quote": final_quote,
        })

    # Status downgrading logic (TRD §7.5)
    downgraded = False
    if not kept_claims:
        final_decision = "abstain"
        if original_decision != "abstain":
            downgraded = True
    elif removed_claims:
        if original_decision == "answerable":
            final_decision = "partial"
            downgraded = True
        else:
            final_decision = "abstain" if original_decision == "abstain" else "partial"
    else:
        final_decision = "partial" if original_decision == "partial" else "answerable"

    return {
        "kept_claims": kept_claims,
        "removed_claims": removed_claims,
        "decision": final_decision,
        "diagnostics": {
            "total_raw_claims": len(raw_claims),
            "kept_claims_count": len(kept_claims),
            "removed_no_valid_citation": removed_no_valid_citation,
            "removed_quote_not_found": removed_quote_not_found,
            "decision_downgraded": downgraded,
            "original_decision": original_decision,
            "final_decision": final_decision,
        },
    }

