"""Unit tests for chunker invariants per PRD FR-CHK-01..04 and TRD §5.3."""

from papertrail.common.schemas import ParsedTextBlock
from papertrail.ingest.chunk import chunk_document


def test_chunker_page_bounded_invariant():
    """Verify that chunks NEVER cross page boundaries."""
    # Create blocks across 2 pages
    blocks = [
        ParsedTextBlock(page_index=1, text="Page 1 sentence one. Page 1 sentence two.", bbox=(0,0,100,100)),
        ParsedTextBlock(page_index=2, text="Page 2 sentence one. Page 2 sentence two.", bbox=(0,0,100,100)),
    ]
    config = {"target_tokens": 100, "overlap_tokens": 20, "min_tokens": 5}
    chunks = chunk_document("test-doc", "ck256", config, blocks)

    assert len(chunks) >= 2
    for c in chunks:
        # Crucial invariant: page_start must equal page_end
        assert c.page_start == c.page_end
        assert c.chunk_id.startswith("test-doc:ck256:p")

def test_chunk_id_determinism():
    """Verify deterministic chunk ID format: <doc_id>:<config_id>:p<page>:c<ordinal>."""
    blocks = [
        ParsedTextBlock(page_index=1, text="A sample sentence for determinism.", bbox=(0,0,100,100)),
    ]
    config = {"target_tokens": 50, "overlap_tokens": 10, "min_tokens": 5}
    chunks1 = chunk_document("doc-a", "ck256", config, blocks)
    chunks2 = chunk_document("doc-a", "ck256", config, blocks)

    assert len(chunks1) == 1
    assert chunks1[0].chunk_id == chunks2[0].chunk_id
    assert chunks1[0].chunk_id == "doc-a:ck256:p1:c0"
    assert chunks1[0].ordinal == 0
