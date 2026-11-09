# PaperTrail: Evaluated Research-Paper Assistant

PaperTrail is an evaluated scientific question-answering system designed to eliminate unverified citations, hallucinated claims, and silent failures on out-of-corpus queries. The platform implements and compares three retrieval strategies—Okapi BM25, dense semantic search via `all-MiniLM-L6-v2`, and Reciprocal Rank Fusion (RRF) hybrid search—over a curated corpus of foundational computer science papers and user-uploaded PDFs.

---

## Key Capabilities

- **Comparative Retrieval:** Direct head-to-head benchmarking among Okapi BM25 (PostgreSQL `tsvector`), dense vector similarity (pgvector 384-dimensional cosine distance), and reciprocal rank fusion hybrid retrieval.
- **Deterministic Citation Verification:** Generated claims require an exact chunk identifier and verbatim text quote verified against the underlying document payload. Unverified assertions downgrade the response status (`answerable` -> `partial` -> `abstain`).
- **Pre-LLM Confidence Gating:** Calibrated retrieval score thresholds evaluate evidence sufficiency prior to model invocation, fast-abstaining on out-of-corpus questions in under 1 second with zero LLM token consumption.
- **Dynamic Document Ingestion:** Client-side text extraction via `unpdf` and browser-side vector generation bypass serverless payload limits, allowing large PDFs (>4 MB) to be chunked, embedded, and indexed with full row-level security isolation.
- **Resilient Generation Engine:** Multi-model fallback pool using Groq with in-memory per-model rate-limit cooldown tracking and deterministic response caching.

---

## Benchmark Results

Evaluation was conducted over 40 stratified questions divided into a 20-question Development split (`questions.dev.jsonl`) and a locked Held-Out Test split (`questions.test.jsonl`, verified via SHA-256).

### Test Split Retrieval & Grounding ($K=5$)

| Retrieval Method | Chunk Config | HitRate@5 | Recall@5 | MRR | Citation Precision | Abstention Accuracy | Average Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dense (all-MiniLM-L6-v2)** | `ck256` | **60.0%** | **56.7%** | 0.343 | **100.0%** | **100.0%** | **911 ms** |
| **Okapi BM25 (Lexical)** | `ck640` | 46.7% | 43.3% | **0.372** | **100.0%** | **100.0%** | 1,549 ms |
| **Okapi BM25 (Reference)** | `ck256` | 46.7% | 43.3% | 0.467 | 66.7% | **100.0%** | 1,462 ms |

### Performance Observations

1. **Semantic Recall:** Dense retrieval (`ck256`) exceeded lexical BM25 by 13.3 percentage points on HitRate@5 and 13.4 percentage points on Recall@5 for queries using conceptual or paraphrased terms.
2. **Lexical Rank-1 Precision:** When queries used precise author names or technical terminology, BM25 achieved higher mean reciprocal rank (MRR 0.372 vs. 0.343).
3. **Grounding Consistency:** Pre-registered evaluation runs achieved 100% Citation Precision and 100% Abstention Accuracy on out-of-domain queries.

---

## Architecture

```
User Query
    │
    ▼
Retriever Selection (Lexical / Dense / Hybrid)
    │
    ├── Lexical: PostgreSQL Okapi BM25 (tsvector over non-reference chunks)
    ├── Dense:   pgvector Cosine Similarity (384-d all-MiniLM-L6-v2 embeddings)
    └── Hybrid:  Reciprocal Rank Fusion (k=60) with document diversity cap
    │
    ▼
Pre-LLM Confidence Gate
    ├── Score < Threshold ──> Fast Abstain (<1s, 0 tokens)
    └── Score ≥ Threshold
            │
            ▼
        Prompt Assembly (Untrusted context blocks)
            │
            ▼
        Groq LLM Generation Pool (llama-3.3-70b / gpt-oss / qwen)
            │
            ▼
        Citation Validation Engine
            ├── Chunk existence check
            ├── Verbatim quote overlap check (threshold ≥ 0.60)
            └── Lexical claim-support heuristic
            │
            ▼
        Response Output (VERIFIED ANSWER / PARTIAL EVIDENCE / ABSTAIN)
```

---

## Foundation Corpus

The baseline evaluation corpus consists of 12 open-access papers defined in `data/manifest/corpus.yaml`:

1. Vaswani et al. (2017) — *Attention Is All You Need*
2. Lewis et al. (2020) — *Retrieval-Augmented Generation for Knowledge-Intensive NLP*
3. Robertson & Zaragoza (2009) — *The Probabilistic Relevance Framework: BM25 and Beyond*
4. Karpukhin et al. (2020) — *Dense Passage Retrieval for Open-Domain Question Answering*
5. Hu et al. (2021) — *LoRA: Low-Rank Adaptation of Large Language Models*
6. Liu et al. (2023) — *Lost in the Middle: How Language Models Use Long Contexts*
7. Es et al. (2023) — *RAGAS: Automated Evaluation of Retrieval Augmented Generation*
8. Devlin et al. (2018) — *BERT: Pre-training of Deep Bidirectional Transformers*
9. Radford et al. (2019) — *Language Models are Unsupervised Multitask Learners*
10. Touvron et al. (2023) — *LLaMA: Open and Efficient Foundation Language Models*
11. Guu et al. (2020) — *REALM: Retrieval-Augmented Language Model Pre-Training*
12. Borgeaud et al. (2022) — *Improving Language Models by Retrieving from Trillions of Tokens (RETRO)*

- **Total Chunks:** 2,015 chunks across two configurations: `ck256` (256 tokens, 32 overlap) and `ck640` (640 tokens, 64 overlap).
- **Postings:** 6,288 indexed lexical terms with pre-computed collection statistics. Reference sections are tagged (`is_references = true`) and excluded from retrieval indexes.

---

## Setup and Installation

### Prerequisites

- Python 3.12+ (managed with `uv`)
- Node.js 18+ (tested on v20 and v22)
- Supabase PostgreSQL database with `pgvector` extension enabled
- Groq Cloud API key

### Environment Variables

Configure `.env` in the root directory (and `web/.env.local` for local Next.js development):

```ini
# Supabase PostgreSQL connection strings
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Groq API Key
GROQ_API_KEY="gsk_..."
```

### Database Provisioning

Apply schema migrations (001 through 006) to set up tables, BM25 term tables, vector columns, indexes, and Row-Level Security:

```bash
cd python
uv sync
cd ..
python python/scripts/apply_migrations.py
```

### Ingestion and Embedding

To populate the 12 base papers, extract page-bounded text, generate `ck256` and `ck640` chunks, and compute 384-dimensional dense vectors:

```bash
python -m papertrail.ingest.pipeline
```

### Web Application

```bash
cd web
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## Testing and Verification

Run the test suite and evaluation scripts:

```bash
# Python unit and schema tests
cd python
uv run pytest -v

# Code quality and style checks
uv run ruff check .

# Next.js type checking and production build
cd ../web
npm run lint
npm run build

# Retrieval evaluation on the development split
python -m papertrail.evaluation.compare_retrieval

# End-to-end evaluation run on test split
python -m papertrail.evaluation.runner --split test --k 5
```

---

## Security Model

- **PostgreSQL Row-Level Security (RLS):** All tables enforce RLS policies. Client queries executed via PostgREST cannot modify document rows, read staging test tables, or access internal evaluation sets.
- **Document Ownership Isolation:** User document uploads and deletions use cryptographically signed session tokens. Document deletion is restricted through a stored procedure (`public.delete_user_document`) that verifies `auth.uid()` and prevents mutation or deletion of the frozen `v1.0` foundation corpus.
- **Evaluation Partition Integrity:** The held-out test split is checked against its recorded SHA-256 digest before benchmark execution to ensure evaluation reproducibility.

---

## Documentation

- `docs/defence-notes.md`: Architectural defense addressing the rubric requirements.
- `docs/contributions.md`: System design decisions and engineering details.
- `docs/limitations.md`: Scope boundaries, corpus constraints, and failure edge cases.
- `docs/failure-analysis.md`: Detailed breakdown of retrieval and citation anomalies.
- `docs/experiments/tuning-log.md`: Pre-registered experiment logs and parameter tracking.
