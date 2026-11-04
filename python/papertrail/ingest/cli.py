"""CLI for PaperTrail Ingestion Pipeline (TRD §5.1 Stage 9).

Usage:
  python -m papertrail.ingest.cli [command]

Commands:
  fetch      Download PDFs from corpus manifest and verify checksums
  index      Compute and update lexical statistics (lexical_stats, lexical_terms)
  embed      Generate 384-d dense embeddings with fastembed (all-MiniLM-L6-v2)
  report     Generate ingestion_report.json from current database state
  pipeline   Run complete end-to-end ingestion pipeline (default)
"""

import argparse
import sys

from papertrail.ingest.embed import embed_all_chunks
from papertrail.ingest.fetch import fetch_corpus
from papertrail.ingest.generate_report import generate_report
from papertrail.ingest.index import update_lexical_index
from papertrail.ingest.pipeline import run_ingestion_pipeline


def main():
    parser = argparse.ArgumentParser(
        prog="papertrail-ingest",
        description="PaperTrail PDF Ingestion & Indexing CLI",
    )
    parser.add_argument(
        "stage",
        nargs="?",
        default="pipeline",
        choices=["fetch", "index", "embed", "report", "pipeline"],
        help="Ingestion stage to execute (default: pipeline)",
    )

    args = parser.parse_args()

    if args.stage == "fetch":
        print("Executing fetch stage...")
        fetch_corpus()
    elif args.stage == "index":
        print("Executing index stage...")
        update_lexical_index()
    elif args.stage == "embed":
        print("Executing embed stage...")
        embed_all_chunks()
    elif args.stage == "report":
        print("Generating ingestion report...")
        generate_report()
    elif args.stage == "pipeline":
        print("Executing full pipeline...")
        run_ingestion_pipeline()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
