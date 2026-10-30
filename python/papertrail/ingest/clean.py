"""PDF text cleaning: two-column reordering, de-hyphenation, unicode NFKC, section & reference flagging."""

import re
import unicodedata

from papertrail.common.schemas import ParsedTextBlock


def dehyphenate(text: str) -> str:
    """Join hyphenated words split across line breaks."""
    # e.g., 'retriev-\nal' -> 'retrieval'
    return re.sub(r"(\b[A-Za-z]+)-\s*\n\s*([a-z]+\b)", r"\1\2", text)

def clean_blocks(blocks: list[ParsedTextBlock], page_width: float = 612.0) -> list[ParsedTextBlock]:
    """
    Cleans, sorts in natural reading order, and flags references/tables/math.
    """
    cleaned: list[ParsedTextBlock] = []
    in_references_section = False

    # Group by page
    pages_dict = {}
    for b in blocks:
        pages_dict.setdefault(b.page_index, []).append(b)

    for page_idx in sorted(pages_dict.keys()):
        page_blocks = pages_dict[page_idx]

        # 1. Filter out running headers and footers
        content_blocks = [b for b in page_blocks if not b.is_header_or_footer]
        if not content_blocks:
            content_blocks = page_blocks

        # 2. Two-column reading order:
        # Check if page is predominantly two-column (blocks centered on left and right)
        mid_x = page_width / 2.0
        left_col = []
        right_col = []
        span_both = []

        for b in content_blocks:
            x0, y0, x1, y1 = b.bbox
            if x0 < mid_x and x1 <= mid_x + 30:
                left_col.append(b)
            elif x0 >= mid_x - 30:
                right_col.append(b)
            else:
                span_both.append(b)

        # If significant text in both columns, sort left column top-to-bottom then right column
        if len(left_col) >= 2 and len(right_col) >= 2:
            left_col.sort(key=lambda b: b.bbox[1])
            right_col.sort(key=lambda b: b.bbox[1])
            span_both.sort(key=lambda b: b.bbox[1])
            # Title or abstract often span both columns at top
            top_span = [b for b in span_both if b.bbox[1] < page_width * 0.4]
            bottom_span = [b for b in span_both if b.bbox[1] >= page_width * 0.4]
            ordered_page_blocks = top_span + left_col + right_col + bottom_span
        else:
            # Single column sort top-to-bottom
            ordered_page_blocks = sorted(content_blocks, key=lambda b: (b.bbox[1], b.bbox[0]))

        # 3. Clean text and detect flags
        for b in ordered_page_blocks:
            # Strip null bytes (PostgreSQL text rejects \x00)
            t = b.text.replace("\x00", "")
            # NFKC normalization
            t = unicodedata.normalize("NFKC", t)
            # De-hyphenate
            t = dehyphenate(t)
            # Replace multiple whitespace
            t = re.sub(r"[ \t]+", " ", t)

            # References detection
            if re.search(r"^(References|Bibliography)\b", t, re.IGNORECASE):
                in_references_section = True

            is_ref = in_references_section or bool(re.match(r"^\[\d+\]\s+[A-Z]", t))
            has_table = bool(re.search(r"\bTable\s+\d+[:.]", t)) or (t.count("\t") > 3)
            math_heavy = bool(re.search(r"(\$|\\sum|\\int|\\mathcal|\\in|\\forall|\\mathbb)", t))

            b.text = t.strip()
            b.is_references = is_ref
            b.has_table = has_table
            b.math_heavy = math_heavy

            if b.text:
                cleaned.append(b)

    return cleaned
