"""PDF parsing stage: extracts text blocks with coordinates using PyMuPDF."""

from pathlib import Path

import pymupdf as fitz

from papertrail.common.schemas import ParsedTextBlock


def parse_pdf(pdf_path: Path) -> list[ParsedTextBlock]:
    """
    Extracts structured text blocks with coordinates per page.
    Page indexing is 1-based.
    """
    blocks: list[ParsedTextBlock] = []
    doc = fitz.open(str(pdf_path))

    for page_idx_0, page in enumerate(doc):
        page_index = page_idx_0 + 1
        page_height = page.rect.height

        # Extract blocks: (x0, y0, x1, y1, text, block_no, block_type)
        raw_blocks = page.get_text("blocks")

        for b in raw_blocks:
            x0, y0, x1, y1, text, block_no, block_type = b
            if block_type != 0:  # Skip image blocks
                continue

            cleaned_text = text.strip()
            if not cleaned_text:
                continue

            # Check if block is at header (top 5%) or footer (bottom 5%)
            is_header_or_footer = (y0 < page_height * 0.05) or (y1 > page_height * 0.95)

            blocks.append(
                ParsedTextBlock(
                    page_index=page_index,
                    text=cleaned_text,
                    bbox=(x0, y0, x1, y1),
                    font_size=10.0,
                    is_bold=False,
                    is_header_or_footer=is_header_or_footer,
                    is_references=False,
                    has_table=False,
                    math_heavy=False,
                )
            )

    doc.close()
    return blocks
