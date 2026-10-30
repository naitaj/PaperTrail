"""Tests for evaluation dataset schema conformity and split integrity."""

import json
from pathlib import Path
import jsonschema
import pytest

ROOT_DIR = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT_DIR / "data" / "eval" / "schema.json"
DEV_QUESTIONS_PATH = ROOT_DIR / "data" / "eval" / "questions.dev.jsonl"
TEST_QUESTIONS_PATH = ROOT_DIR / "data" / "eval" / "questions.test.jsonl"

@pytest.fixture
def eval_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def load_jsonl(path: Path):
    if not path.exists():
        return []
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records

def test_schema_validity(eval_schema):
    """Verify that schema.json itself is a valid JSON Schema draft-07."""
    jsonschema.Draft7Validator.check_schema(eval_schema)

def test_questions_conform_to_schema(eval_schema):
    """Verify all questions in dev and test match schema."""
    dev_records = load_jsonl(DEV_QUESTIONS_PATH)
    test_records = load_jsonl(TEST_QUESTIONS_PATH)
    all_records = dev_records + test_records

    if not all_records:
        pytest.skip("No question records found yet.")

    validator = jsonschema.Draft7Validator(eval_schema)
    for q in all_records:
        errors = list(validator.iter_errors(q))
        assert not errors, f"Validation errors on {q.get('question_id')}: {errors}"

def test_splits_disjoint():
    """Verify dev and test splits have no overlapping questions."""
    dev_records = load_jsonl(DEV_QUESTIONS_PATH)
    test_records = load_jsonl(TEST_QUESTIONS_PATH)

    dev_ids = {q["question_id"] for q in dev_records}
    test_ids = {q["question_id"] for q in test_records}

    intersection = dev_ids.intersection(test_ids)
    assert not intersection, f"Overlapping IDs in dev and test: {intersection}"
