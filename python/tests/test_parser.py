"""Unit tests for PDF parser and validator."""

from papertrail.ingest.clean import dehyphenate
from papertrail.ingest.validate import validate_pdf


def test_dehyphenate():
    assert dehyphenate("retriev-\nal") == "retrieval"
    assert dehyphenate("trans-\nformer") == "transformer"
    assert dehyphenate("already clean") == "already clean"

def test_validate_pdf_missing(tmp_path):
    missing_file = tmp_path / "missing.pdf"
    status, detail, pages = validate_pdf(missing_file)
    assert status == "corrupt"
    assert pages == 0

def test_validate_pdf_empty(tmp_path):
    empty_file = tmp_path / "empty.pdf"
    empty_file.write_bytes(b"")
    status, detail, pages = validate_pdf(empty_file)
    assert status == "empty"
    assert pages == 0
