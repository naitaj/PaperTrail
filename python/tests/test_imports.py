"""Sanity import test for PaperTrail python dependencies."""

def test_imports():
    import anthropic
    import fitz  # PyMuPDF
    import httpx
    import numpy
    import openai
    import pgvector
    import psycopg
    import pydantic
    import rapidfuzz
    import tenacity
    import tiktoken

    import papertrail

    assert fitz is not None
    assert tiktoken is not None
    assert psycopg is not None
    assert pgvector is not None
    assert pydantic is not None
    assert numpy is not None
    assert rapidfuzz is not None
    assert tenacity is not None
    assert httpx is not None
    assert openai is not None
    assert anthropic is not None
    assert papertrail is not None
