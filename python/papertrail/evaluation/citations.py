"""Citation validation engine for PaperTrail (TRD §7.5, FR-CIT-01..05).

Validates model claims against retrieved context chunks:
1. Every claim must cite a chunk present in the retrieved context set.
2. The evidence quote must exist verbatim (or high contiguous-window overlap) in the cited chunk.
3. The claim text must be lexically grounded in the cited passage.
4. Automatically downgrades response decision to 'partial' or 'abstain' when claims fail.
"""

import re
from typing import Any

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "when",
    "at", "by", "for", "with", "about", "against", "between", "into",
    "through", "during", "before", "after", "above", "below", "to", "from",
    "up", "down", "in", "out", "on", "off", "over", "under", "again",
    "further", "once", "here", "there", "where", "why", "how", "all", "any",
    "both", "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
    "will", "just", "should", "now", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "of", "as", "that",
    "this", "these", "those", "it", "its", "they", "them", "their", "which",
    "who", "whom", "whose", "what", "also", "may", "might", "could", "would",
}


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


def tokenize_alnum(text: str) -> list[str]:
    """Extract lowercase alphanumeric tokens."""
    norm = normalise_text(text)
    if not norm:
        return []
    cleaned = re.sub(r"[^a-z0-9\s]", " ", norm)
    return [t for t in cleaned.split() if t]


def window_overlap_ratio(haystack: str, needle: str) -> float:
    """Calculate contiguous-window ordered token overlap ratio between needle and haystack."""
    norm_haystack = normalise_text(haystack)
    norm_needle = normalise_text(needle)

    if not norm_needle:
        return 0.0
    if norm_needle in norm_haystack:
        return 1.0

    h_tokens = tokenize_alnum(haystack)
    n_tokens = tokenize_alnum(needle)
    if not n_tokens or not h_tokens:
        return 0.0

    h_joined = " " + " ".join(h_tokens) + " "
    n_joined = " " + " ".join(n_tokens) + " "
    if n_joined in h_joined:
        return 1.0

    if len(n_tokens) == 1:
        return 1.0 if n_tokens[0] in h_tokens else 0.0

    window_len = min(len(h_tokens), len(n_tokens) + 3)
    best_score = 0.0

    for start in range(0, len(h_tokens) - window_len + 1):
        win = h_tokens[start : start + window_len]
        h_idx = 0
        ordered_matched = 0
        for nt in n_tokens:
            try:
                found_offset = win[h_idx:].index(nt)
                ordered_matched += 1
                h_idx += found_offset + 1
            except ValueError:
                pass
        ratio = ordered_matched / len(n_tokens)
        if ratio > best_score:
            best_score = ratio
        if best_score == 1.0:
            break

    return best_score


def claim_support_ratio(claim_text: str, evidence_source_text: str) -> float:
    """Measure content-token lexical grounding of claim_text in evidence_source_text."""
    claim_tokens = [
        t for t in tokenize_alnum(claim_text) if len(t) >= 2 and t not in STOPWORDS
    ]
    if not claim_tokens:
        return 1.0

    source_tokens = set(tokenize_alnum(evidence_source_text))
    if not source_tokens:
        return 0.0

    supported = 0
    for ct in claim_tokens:
        if ct in source_tokens:
            supported += 1
            continue
        if len(ct) >= 5:
            stem = ct[: min(len(ct) - 1, 6)]
            if any(
                len(st) >= 4 and (st.startswith(stem) or ct.startswith(st[:5]))
                for st in source_tokens
            ):
                supported += 1

    return supported / len(claim_tokens)


def _build_searchable_chunk_text(chunk: dict[str, Any]) -> str:
    parts: list[str] = []
    doc_title = chunk.get("doc_title")
    doc_authors = chunk.get("doc_authors") or []
    doc_year = chunk.get("doc_year")
    page_start = chunk.get("page_start", 1)
    if doc_title or doc_authors or doc_year:
        author_line = f" | Authors: {', '.join(doc_authors)}" if doc_authors else ""
        year_line = f" | Year: {doc_year}" if doc_year else ""
        parts.append(
            f"[Title: {doc_title or chunk.get('doc_id', '')}{author_line}{year_line} | Page {page_start}]"
        )
    parts.append(str(chunk.get("text", "")))
    return "\n".join(parts)


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

    citation_existence_passed = 0
    quote_exact_match_count = 0
    quote_contiguous_overlap_count = 0
    heuristic_lexical_overlap_passed = 0
    removed_no_valid_citation = 0
    removed_quote_not_found = 0
    removed_claim_low_lexical_overlap_heuristic = 0

    for claim in raw_claims:
        claim_text = str(claim.get("claim_text", "")).strip()
        chunk_id = str(claim.get("citation_chunk_id", "")).strip()
        raw_quote = str(claim.get("evidence_quote", "")).strip()

        if not claim_text:
            continue

        # Dimension 1: Citation Existence (chunk_id must exist in retrieved context)
        if not chunk_id or chunk_id not in chunk_map:
            removed_claims.append({
                "claim": claim,
                "reason": "REMOVED_NO_VALID_CITATION",
                "detail": f"Chunk '{chunk_id}' was not in the retrieved context set.",
            })
            removed_no_valid_citation += 1
            continue
        citation_existence_passed += 1

        chunk = chunk_map[chunk_id]
        chunk_text = str(chunk.get("text", ""))
        searchable_text = _build_searchable_chunk_text(chunk)

        # Dimension 2: Quote Correctness (verbatim or contiguous-window overlap)
        norm_chunk_text = normalise_text(searchable_text)
        norm_quote = normalise_text(raw_quote)
        quote_tokens = tokenize_alnum(raw_quote)

        is_non_trivial = len(quote_tokens) >= 2 or len(norm_quote) >= 8
        is_exact = bool(is_non_trivial and norm_quote in norm_chunk_text)
        overlap = window_overlap_ratio(searchable_text, raw_quote) if is_non_trivial else 0.0

        quote_verified = False
        final_quote = raw_quote

        if is_exact:
            quote_verified = True
            quote_exact_match_count += 1
        elif overlap >= 0.85:
            quote_verified = True
            quote_contiguous_overlap_count += 1
            final_quote = raw_quote + " [Note: High-overlap match]"
        elif not strict_mode and is_non_trivial:
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

        # Dimension 3: Runtime Lexical Overlap Heuristic (heuristic filter, NOT proof of entailment)
        heuristic_score = claim_support_ratio(claim_text, f"{raw_quote} {searchable_text}")
        if strict_mode and heuristic_score < 0.25:
            removed_claims.append({
                "claim": claim,
                "reason": "REMOVED_CLAIM_LOW_LEXICAL_OVERLAP_HEURISTIC",
                "detail": f"Claim '{claim_text[:50]}' failed lexical overlap heuristic ({heuristic_score:.2f}) in chunk {chunk_id}.",
            })
            removed_claim_low_lexical_overlap_heuristic += 1
            continue
        heuristic_lexical_overlap_passed += 1

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
            "citation_existence_passed": citation_existence_passed,
            "quote_exact_match_count": quote_exact_match_count,
            "quote_contiguous_overlap_count": quote_contiguous_overlap_count,
            "heuristic_lexical_overlap_passed": heuristic_lexical_overlap_passed,
            "removed_no_valid_citation": removed_no_valid_citation,
            "removed_quote_not_found": removed_quote_not_found,
            "removed_claim_low_lexical_overlap_heuristic": removed_claim_low_lexical_overlap_heuristic,
            "decision_downgraded": downgraded,
            "original_decision": original_decision,
            "final_decision": final_decision,
        },
    }
