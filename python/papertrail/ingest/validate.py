"""PDF validation stage: verifies file integrity, pages, and extractable text."""

from pathlib import Path

import pymupdf as fitz


def validate_pdf(pdf_path: Path) -> tuple[str, str, int]:
    """
    Validates a PDF file.
    Returns (status, status_detail, page_count).
    Status values: 'ready', 'empty', 'corrupt', 'unsupported_scanned', 'failed'
    """
    if not pdf_path.exists():
        return "corrupt", "File does not exist", 0

    if pdf_path.stat().st_size == 0:
        return "empty", "File size is 0 bytes", 0

    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        return "corrupt", f"Failed to open PDF: {str(e)}", 0

    n_pages = len(doc)
    if n_pages == 0:
        doc.close()
        return "empty", "PDF contains 0 pages", 0

    # Check for extractable text (detect scanned image-only PDFs)
    total_chars = 0
    pages_with_text = 0

    for i in range(min(5, n_pages)):
        page = doc[i]
        text = page.get_text().strip()
        total_chars += len(text)
        if len(text) > 50:
            pages_with_text += 1

    doc.close()

    # If first 5 pages have less than 100 characters combined, it's likely a scanned image
    if total_chars < 100 and pages_with_text == 0:
        return "unsupported_scanned", f"Only {total_chars} characters extracted across first {min(5, n_pages)} pages (likely scanned image)", n_pages

    return "ready", f"Valid text PDF with {n_pages} pages ({total_chars} sample chars)", n_pages
