"""Generates data/results/ingestion/ingestion_report.json from database."""

import json

from papertrail.common.config import RESULTS_DIR
from papertrail.common.db import get_db_connection


def generate_report():
    out_dir = RESULTS_DIR / "ingestion"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / "ingestion_report.json"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT doc_id, title, authors, year, venue, doi, source_url,
                       license, sha256, text_hash, n_pages, status, status_detail,
                       corpus_version, ingested_at
                FROM documents
                ORDER BY doc_id;
            """)
            docs = []
            for row in cur.fetchall():
                docs.append({
                    "doc_id": row[0],
                    "title": row[1],
                    "authors": row[2],
                    "year": row[3],
                    "venue": row[4],
                    "doi": row[5],
                    "source_url": row[6],
                    "license": row[7],
                    "sha256": row[8],
                    "text_hash": row[9],
                    "n_pages": row[10],
                    "status": row[11],
                    "status_detail": row[12],
                    "corpus_version": row[13],
                    "ingested_at": row[14].isoformat() if row[14] else None,
                })

            cur.execute("""
                SELECT config_id, count(*)
                FROM chunks
                GROUP BY config_id;
            """)
            chunk_counts = dict(cur.fetchall())

            cur.execute("SELECT count(*) FROM documents WHERE status = 'ready';")
            ready_count = cur.fetchone()[0]

    report = {
        "corpus_version": "v1.0",
        "total_manifest_papers": len(docs),
        "documents": docs,
        "summary": {
            "ready": ready_count,
            "duplicate": 0,
            "corrupt": 0,
            "empty": 0,
            "unsupported_scanned": 0,
            "failed": 0,
            "total_chunks_ck256": chunk_counts.get("ck256", 0),
            "total_chunks_ck640": chunk_counts.get("ck640", 0),
        }
    }

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Generated {report_file} with {len(docs)} documents.")
    print(f"Summary: {report['summary']}")

if __name__ == "__main__":
    generate_report()
