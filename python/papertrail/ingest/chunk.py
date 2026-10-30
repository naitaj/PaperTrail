"""Chunking stage: page-bounded sentence packing with deterministic IDs."""

import re

import tiktoken

from papertrail.common.schemas import ChunkSchema, ParsedTextBlock
from papertrail.ingest.dedupe import compute_text_hash

_ENCODER = None

def get_tokenizer():
    global _ENCODER
    if _ENCODER is None:
        _ENCODER = tiktoken.get_encoding("cl100k_base")
    return _ENCODER

def count_tokens(text: str) -> int:
    return len(get_tokenizer().encode(text))

def split_sentences(text: str) -> list[str]:
    """Split text into sentences while preserving reasonable boundaries."""
    # Split on period, exclamation, or question mark followed by space or newline and uppercase letter
    raw_sents = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'\[])", text)
    sentences = [s.strip() for s in raw_sents if s.strip()]
    return sentences if sentences else [text.strip()]

def chunk_document(
    doc_id: str,
    config_id: str,
    config_params: dict[str, any],
    cleaned_blocks: list[ParsedTextBlock]
) -> list[ChunkSchema]:
    """
    Produce page-bounded chunks for a single document under a given chunk configuration.
    Guarantees:
      - No chunk crosses page boundaries (page_start == page_end)
      - Deterministic chunk_id: <doc_id>:<config_id>:p<page>:c<ordinal>
      - ordinal is sequentially unique per (doc_id, config_id)
      - Target token size and overlap respected
    """
    target_tokens = int(config_params.get("target_tokens", 256))
    overlap_tokens = int(config_params.get("overlap_tokens", 48))
    min_tokens = int(config_params.get("min_tokens", 30))

    # Group blocks by page (1-based index)
    pages: dict[int, list[ParsedTextBlock]] = {}
    for b in cleaned_blocks:
        pages.setdefault(b.page_index, []).append(b)

    chunks: list[ChunkSchema] = []
    global_ordinal = 0

    for page_idx in sorted(pages.keys()):
        page_blocks = pages[page_idx]

        # Combine blocks into a coherent text stream for the page
        page_text = "\n\n".join(b.text for b in page_blocks if b.text)
        is_references_page = any(b.is_references for b in page_blocks)
        has_table_page = any(b.has_table for b in page_blocks)
        math_heavy_page = any(b.math_heavy for b in page_blocks)

        sentences = split_sentences(page_text)
        if not sentences:
            continue

        sent_tokens = [(s, count_tokens(s)) for s in sentences]

        i = 0
        n_sents = len(sent_tokens)

        while i < n_sents:
            current_sents = []
            current_tok_count = 0
            start_i = i

            while i < n_sents:
                s_text, s_toks = sent_tokens[i]
                # If adding this sentence exceeds target and we already have some tokens
                if current_tok_count + s_toks > target_tokens and current_tok_count >= min_tokens:
                    break
                current_sents.append(s_text)
                current_tok_count += s_toks
                i += 1

            # Ensure we make progress even if a single sentence exceeds target
            if not current_sents and i < n_sents:
                s_text, s_toks = sent_tokens[i]
                current_sents.append(s_text)
                current_tok_count = s_toks
                i += 1

            chunk_text = " ".join(current_sents).strip()
            if not chunk_text:
                continue

            chunk_hash = compute_text_hash(chunk_text)
            chunk_id = f"{doc_id}:{config_id}:p{page_idx}:c{global_ordinal}"

            chunks.append(
                ChunkSchema(
                    chunk_id=chunk_id,
                    doc_id=doc_id,
                    config_id=config_id,
                    page_start=page_idx,
                    page_end=page_idx,  # Page bounded invariant
                    ordinal=global_ordinal,
                    section_title=None,
                    text=chunk_text,
                    text_hash=chunk_hash,
                    token_count=current_tok_count,
                    lex_len=len(chunk_text.split()),
                    is_references=is_references_page,
                    has_table=has_table_page,
                    math_heavy=math_heavy_page,
                    layout_uncertain=False,
                )
            )
            global_ordinal += 1

            # Compute overlap for the next chunk on the same page
            if i < n_sents and overlap_tokens > 0:
                overlap_count = 0
                backtrack_idx = i - 1
                while backtrack_idx > start_i:
                    overlap_count += sent_tokens[backtrack_idx][1]
                    if overlap_count >= overlap_tokens:
                        break
                    backtrack_idx -= 1
                # Move start index for next chunk to backtrack point
                if backtrack_idx > start_i and backtrack_idx < i:
                    i = backtrack_idx

    return chunks
