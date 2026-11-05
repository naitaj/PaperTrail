"""Verify Phase 3: Audit q-auth-01..04 against actual DB metadata and chunks, and verify test split hash."""

import hashlib
import json
from pathlib import Path
import psycopg
from papertrail.common.config import get_database_url
from papertrail.evaluation.citations import normalise_text

ROOT_DIR = Path(__file__).resolve().parents[1]
DEV_PATH = ROOT_DIR / "data" / "eval" / "questions.dev.jsonl"
TEST_PATH = ROOT_DIR / "data" / "eval" / "questions.test.jsonl"
GOLD_PATH = ROOT_DIR / "data" / "eval" / "gold_annotations.json"

EXPECTED_TEST_SHA256 = "c215596c4757605dcf0a97e3889e3b70f034aeec3f73e06c41cf31b3dc347d50"

def main():
    test_sha = hashlib.sha256(TEST_PATH.read_bytes()).hexdigest()
    print(f"questions.test.jsonl SHA-256: {test_sha}")
    assert test_sha == EXPECTED_TEST_SHA256, f"TEST SPLIT MODIFIED! {test_sha} != {EXPECTED_TEST_SHA256}"

    dev_qs = [json.loads(line) for line in DEV_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    gold_ann = json.loads(GOLD_PATH.read_text(encoding="utf-8"))

    auth_qs = [q for q in dev_qs if q["question_id"].startswith("q-auth-")]
    print(f"Found {len(auth_qs)} author/entity dev questions: {[q['question_id'] for q in auth_qs]}")

    db_url = get_database_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for q in auth_qs:
                qid = q["question_id"]
                ge = q["gold_evidence"][0]
                doc_id = ge["doc_id"]
                span = ge["span"]

                cur.execute(
                    "SELECT doc_id, title, authors, year FROM documents WHERE doc_id = %s",
                    (doc_id,),
                )
                doc_row = cur.fetchone()
                print(f"\n--- {qid} ({doc_id}) ---")
                print(f"DB Metadata: title={doc_row[1]!r}, authors={doc_row[2]!r}, year={doc_row[3]}")
                print(f"Question: {q['question']}")
                print(f"Reference Answer: {q['reference_answer']}")

                cur.execute(
                    """
                    SELECT chunk_id, config_id, page_start, ordinal, text
                    FROM chunks
                    WHERE doc_id = %s AND ordinal IN (0, 1)
                    ORDER BY config_id, ordinal
                    """,
                    (doc_id,),
                )
                chunk_rows = cur.fetchall()
                for cr in chunk_rows:
                    cid, cfg, pg, ord_idx, txt = cr
                    in_txt = normalise_text(span) in normalise_text(txt)
                    print(f"  Chunk {cid} (p.{pg}, ord={ord_idx}): span_exact_match={in_txt}")
                    if ord_idx == 0 and cfg == "ck256":
                        print(f"    c0 text preview: {txt[:320]!r}")

                ann = gold_ann.get(qid, {})
                print(f"  gold_annotations gold_chunk_ids: {ann.get('gold_chunk_ids')}")

if __name__ == "__main__":
    main()

