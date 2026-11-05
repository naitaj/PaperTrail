"""Dataset loader and gold-evidence matching logic."""

import json
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz

ROOT_DIR = Path(__file__).resolve().parents[3]
DEV_PATH = ROOT_DIR / "data" / "eval" / "questions.dev.jsonl"
TEST_PATH = ROOT_DIR / "data" / "eval" / "questions.test.jsonl"
GOLD_ANNOTATIONS_PATH = ROOT_DIR / "data" / "eval" / "gold_annotations.json"


def load_eval_split(split: str = "dev") -> list[dict[str, Any]]:
    path = DEV_PATH if split == "dev" else TEST_PATH
    if not path.exists():
        raise FileNotFoundError(f"Questions file not found: {path}")

    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def load_gold_annotations() -> dict[str, Any]:
    if not GOLD_ANNOTATIONS_PATH.exists():
        return {}
    with open(GOLD_ANNOTATIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


def is_chunk_relevant(
    chunk: dict[str, Any],
    gold_evidence: list[dict[str, Any]],
    gold_chunk_ids: list[str] | None = None,
) -> bool:
    """Checks if a retrieved chunk matches any gold evidence record or verified gold chunk ID."""
    chunk_id = chunk.get("chunk_id")
    if gold_chunk_ids and chunk_id in gold_chunk_ids:
        return True

    if not gold_evidence:
        return False

    chunk_doc = chunk.get("doc_id")
    chunk_page = chunk.get("page_start")
    chunk_text = chunk.get("text", "")

    for gold in gold_evidence:
        gold_doc = gold.get("doc_id")
        if chunk_doc != gold_doc:
            continue

        gold_pages = gold.get("pages", [])
        if chunk_page in gold_pages:
            return True

        gold_span = gold.get("span", "")
        if gold_span and len(gold_span) > 20:
            if gold_span in chunk_text:
                return True
            ratio = fuzz.partial_ratio(gold_span.lower(), chunk_text.lower())
            if ratio > 80:
                return True

    return False
