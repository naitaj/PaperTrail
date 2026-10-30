"""End-to-end PDF ingestion pipeline for PaperTrail."""

import json

from papertrail.common.config import (
    RAW_DATA_DIR,
    RESULTS_DIR,
    load_chunk_configs,
    load_manifest,
)
from papertrail.common.schemas import DocumentPageSchema, DocumentSchema
from papertrail.ingest.chunk import chunk_document
from papertrail.ingest.clean import clean_blocks
from papertrail.ingest.dedupe import check_duplicate, compute_text_hash
from papertrail.ingest.index import update_lexical_index
from papertrail.ingest.load import load_chunk_configs_to_db, load_document_to_db
from papertrail.ingest.parse import parse_pdf
from papertrail.ingest.validate import validate_pdf


def run_ingestion_pipeline():
    manifest = load_manifest()
    chunk_configs = load_chunk_configs()
    papers = manifest.get("papers", [])
    corpus_version = manifest.get("corpus_version", "v1.0")

    print("=== Starting PaperTrail Ingestion Pipeline ===")
    print(f"Corpus version: {corpus_version}")
    print(f"Papers in manifest: {len(papers)}")
    print(f"Chunk configurations: {list(chunk_configs.keys())}")

    # Step 1: Ensure chunk_configs exist in database
    load_chunk_configs_to_db(chunk_configs)

    results_dir = RESULTS_DIR / "ingestion"
    results_dir.mkdir(parents=True, exist_ok=True)

    ingestion_report = {
        "corpus_version": corpus_version,
        "total_manifest_papers": len(papers),
        "documents": [],
        "summary": {
            "ready": 0,
            "duplicate": 0,
            "corrupt": 0,
            "empty": 0,
            "unsupported_scanned": 0,
            "failed": 0,
            "total_chunks_ck256": 0,
            "total_chunks_ck640": 0,
        }
    }

    existing_docs: list[dict[str, str]] = []

    for idx, paper in enumerate(papers, 1):
        doc_id = paper["doc_id"]
        pdf_path = RAW_DATA_DIR / f"{doc_id}.pdf"
        sha256 = paper.get("sha256", "")

        print(f"\n[{idx}/{len(papers)}] Processing {doc_id} ...")

        # 1. Validate
        status, status_detail, n_pages = validate_pdf(pdf_path)
        if status != "ready":
            print(f"  [STATUS: {status.upper()}] {status_detail}")
            doc_schema = DocumentSchema(
                doc_id=doc_id,
                title=paper.get("title"),
                authors=paper.get("authors"),
                year=paper.get("year"),
                venue=paper.get("venue"),
                doi=paper.get("doi"),
                source_url=paper.get("source_url"),
                license=paper.get("license"),
                sha256=sha256 or "none",
                n_pages=max(1, n_pages),
                status=status,
                status_detail=status_detail,
                corpus_version=corpus_version,
            )
            load_document_to_db(doc_schema, [], [])
            ingestion_report["documents"].append(doc_schema.model_dump())
            ingestion_report["summary"][status] += 1
            continue

        # 2. Parse
        blocks = parse_pdf(pdf_path)
        print(f"  Extracted {len(blocks)} raw text blocks across {n_pages} pages")

        # 3. Clean
        cleaned_blocks = clean_blocks(blocks)
        full_text = "\n".join(b.text for b in cleaned_blocks)
        text_hash = compute_text_hash(full_text)

        # 4. Deduplicate
        is_dup, dup_of, dup_reason = check_duplicate(
            doc_id, sha256, text_hash, full_text, existing_docs
        )
        if is_dup:
            print(f"  [DUPLICATE] Detected as duplicate of {dup_of}: {dup_reason}")
            doc_schema = DocumentSchema(
                doc_id=doc_id,
                title=paper.get("title"),
                authors=paper.get("authors"),
                year=paper.get("year"),
                venue=paper.get("venue"),
                doi=paper.get("doi"),
                source_url=paper.get("source_url"),
                license=paper.get("license"),
                sha256=sha256,
                text_hash=text_hash,
                n_pages=n_pages,
                status="duplicate",
                status_detail=dup_reason,
                duplicate_of=dup_of,
                corpus_version=corpus_version,
            )
            load_document_to_db(doc_schema, [], [])
            ingestion_report["documents"].append(doc_schema.model_dump())
            ingestion_report["summary"]["duplicate"] += 1
            continue

        existing_docs.append({
            "doc_id": doc_id,
            "sha256": sha256,
            "text_hash": text_hash,
            "text_sample": full_text[:2000],
        })

        # 5. Build DocumentPage records
        doc_pages: list[DocumentPageSchema] = []
        page_char_counts = {}
        for b in cleaned_blocks:
            page_char_counts[b.page_index] = page_char_counts.get(b.page_index, 0) + len(b.text)

        for p_idx in range(1, n_pages + 1):
            doc_pages.append(
                DocumentPageSchema(
                    doc_id=doc_id,
                    page_index=p_idx,
                    page_label=str(p_idx),
                    char_count=page_char_counts.get(p_idx, 0),
                    quality_flags=[]
                )
            )

        # 6. Chunk for all configs (ck256, ck640)
        all_chunks = []
        chunks_by_cfg = {}
        for cfg_id, params in chunk_configs.items():
            cfg_chunks = chunk_document(doc_id, cfg_id, params, cleaned_blocks)
            chunks_by_cfg[cfg_id] = len(cfg_chunks)
            all_chunks.extend(cfg_chunks)
            ingestion_report["summary"][f"total_chunks_{cfg_id}"] += len(cfg_chunks)
            print(f"  -> Generated {len(cfg_chunks)} chunks for {cfg_id}")

        # 7. Load into database
        doc_schema = DocumentSchema(
            doc_id=doc_id,
            title=paper.get("title"),
            authors=paper.get("authors"),
            year=paper.get("year"),
            venue=paper.get("venue"),
            doi=paper.get("doi"),
            source_url=paper.get("source_url"),
            license=paper.get("license"),
            sha256=sha256,
            text_hash=text_hash,
            n_pages=n_pages,
            status="ready",
            status_detail=f"Successfully ingested ({chunks_by_cfg.get('ck256', 0)} ck256 chunks, {chunks_by_cfg.get('ck640', 0)} ck640 chunks)",
            corpus_version=corpus_version,
        )

        load_document_to_db(doc_schema, doc_pages, all_chunks)
        ingestion_report["documents"].append(doc_schema.model_dump())
        ingestion_report["summary"]["ready"] += 1
        print(f"  [SAVED TO DB] {doc_id} successfully upserted.")

    # Step 8: Build Lexical Index
    print("\n=== Updating Lexical BM25 Statistics in Database ===")
    update_lexical_index()

    # Step 9: Write Ingestion Report
    report_file = results_dir / "ingestion_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(ingestion_report, f, indent=2)

    print(f"\nIngestion report written to {report_file}")
    print("=== Ingestion Pipeline Complete ===")
    print(f"Summary: {ingestion_report['summary']}")

if __name__ == "__main__":
    run_ingestion_pipeline()
