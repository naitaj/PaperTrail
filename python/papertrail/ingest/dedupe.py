"""Deduplication stage: detects exact file duplicates, text-hash matches, and near-duplicates."""

import hashlib

from rapidfuzz import fuzz


def compute_text_hash(text: str) -> str:
    """Returns SHA-256 of normalized text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def check_duplicate(
    doc_id: str,
    sha256: str,
    text_hash: str,
    full_text: str,
    existing_docs: list[dict[str, str]]
) -> tuple[bool, str | None, str | None]:
    """
    Checks if a document is a duplicate of any existing document.
    Returns (is_duplicate, duplicate_of_doc_id, reason).
    """
    for ed in existing_docs:
        # Same doc_id is considered an update/overwrite, not a duplicate
        if ed.get("doc_id") == doc_id:
            continue

        # Exact file SHA-256 match
        if ed.get("sha256") == sha256:
            return True, ed["doc_id"], "Exact file SHA-256 match"

        # Exact extracted text hash match
        if ed.get("text_hash") == text_hash:
            return True, ed["doc_id"], "Identical text hash match"

        # Near-duplicate text similarity (sample check)
        ed_sample = ed.get("text_sample", "")
        if ed_sample and full_text:
            ratio = fuzz.ratio(full_text[:2000], ed_sample[:2000])
            if ratio > 98:
                return True, ed["doc_id"], f"Near-duplicate text similarity ({ratio}% match)"

    return False, None, None
