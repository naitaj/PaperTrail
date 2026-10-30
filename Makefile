# PaperTrail Makefile
# Commands for testing, ingestion, evaluation, and reproduction

.PHONY: help test test-web test-py test-db test-api test-eval reproduce-tables fetch-corpus ingest eval-dev eval-final smoke db-migrate dev-web

help:
	@echo "Available commands:"
	@echo "  make test              Run all unit and integration tests"
	@echo "  make test-web          Run web unit and lint tests"
	@echo "  make test-py           Run python test suite with pytest"
	@echo "  make test-db           Test database connection and schema"
	@echo "  make test-api          Run API integration tests"
	@echo "  make test-eval         Run evaluation dataset schema & integrity tests"
	@echo "  make reproduce-tables  Reproduce all evaluation tables and plots from results"
	@echo "  make fetch-corpus      Download corpus PDFs using manifest and verify checksums"
	@echo "  make ingest            Run PDF ingestion, chunking, and embedding"
	@echo "  make eval-dev          Run evaluation harness against dev question split"
	@echo "  make eval-final        Run evaluation harness against held-out test split"
	@echo "  make smoke             Run end-to-end smoke test"
	@echo "  make db-migrate        Apply PostgreSQL database migrations"
	@echo "  make dev-web           Start Next.js development server"

dev-web:
	cd web && npm run dev

test-web:
	cd web && npm run lint

test-py:
	cd python && uv run pytest

test: test-web test-py

test-eval:
	cd python && uv run pytest tests/test_eval_schema.py

fetch-corpus:
	cd python && uv run python -m papertrail.ingest.fetch_corpus

ingest:
	cd python && uv run python -m papertrail.ingest.pipeline

eval-dev:
	cd python && uv run python -m papertrail.evaluation.run --split dev

eval-final:
	cd python && uv run python -m papertrail.evaluation.run --split test

reproduce-tables:
	cd python && uv run python -m papertrail.evaluation.reproduce_tables

smoke:
	cd python && uv run pytest tests/test_smoke.py

db-migrate:
	cd python && uv run python -m papertrail.common.migrate
