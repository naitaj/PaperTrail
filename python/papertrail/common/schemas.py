"""Pydantic data schemas for PaperTrail documents, pages, and chunks."""


from pydantic import BaseModel, Field


class ParsedTextBlock(BaseModel):
    page_index: int
    text: str
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)
    font_size: float = 10.0
    is_bold: bool = False
    is_header_or_footer: bool = False
    is_references: bool = False
    has_table: bool = False
    math_heavy: bool = False

class DocumentPageSchema(BaseModel):
    doc_id: str
    page_index: int
    page_label: str | None = None
    char_count: int
    quality_flags: list[str] = Field(default_factory=list)

class DocumentSchema(BaseModel):
    doc_id: str
    title: str | None = None
    authors: list[str] | None = None
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    source_url: str
    license: str | None = None
    sha256: str
    text_hash: str | None = None
    n_pages: int
    status: str = "ready"
    status_detail: str | None = None
    duplicate_of: str | None = None
    corpus_version: str = "v1.0"

class ChunkSchema(BaseModel):
    chunk_id: str
    doc_id: str
    config_id: str
    page_start: int
    page_end: int
    ordinal: int
    section_title: str | None = None
    text: str
    text_hash: str
    token_count: int
    lex_len: int = 0
    is_references: bool = False
    has_table: bool = False
    math_heavy: bool = False
    layout_uncertain: bool = False
