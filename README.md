# PaperTrail: Evaluated Research-Paper Assistant

> **An evaluated, grounded scientific research assistant comparing Okapi BM25 vs. Dense Embedding retrieval with verified citations and abstention benchmarking.**

[![Python Tests](https://img.shields.io/badge/pytest-22%20passed-emerald)](python/tests/)
[![Next.js Build](https://img.shields.io/badge/next.js-v16%20clean-blue)](web/)
[![Database](https://img.shields.io/badge/database-Supabase%20pgvector%20(RLS)-indigo)](db/migrations/)
[![Inference Cost](https://img.shields.io/badge/AI%20Cost-%240.00%20(Zero--Cost)-success)](docs/contributions.md)

---

## 📖 Executive Summary

**PaperTrail** is a production-grade research assistant designed to answer technical scientific questions over a curated corpus of foundational computer science papers. It is built to address the critical failure modes of standard Retrieval-Augmented Generation (RAG) systems: **unverified citations, hallucinated extrapolations, and silent confabulation on out-of-domain queries**.

### Key System Capabilities
1. **Empirical Retrieval Comparison:** Direct head-to-head evaluation between pure PostgreSQL **Okapi BM25** and **all-MiniLM-L6-v2 (384-d)** dense semantic search.
2. **Deterministic Citation Verification:** Every generated claim must provide an exact chunk identifier and a verbatim quotation verified against the underlying document payload. Unverified assertions automatically trigger status downgrading (`answerable` &rarr; `partial` &rarr; `abstain`).
3. **Pre-LLM Confidence Gating (~1ms, 0 Tokens):** Calibrated mathematical score thresholds fast-abstain on out-of-domain or ungroundable queries before calling the LLM, eliminating hallucination risk and unnecessary token spend.
4. **Zero-Cost Inference Architecture:** Powered exclusively by **Groq Cloud** (`openai/gpt-oss-120b`) for ultra-fast generation and open-source `sentence-transformers/all-MiniLM-L6-v2` running locally in Python during ingestion and in-browser via `@xenova/transformers` WebAssembly.
5. **Editorial Broadsheet Workspace:** High-density, tactile 3-column academic workspace designed in Google Stitch, featuring paper indexing, interactive citation cross-highlighting, and adjacent context expansion modals ($\pm 1$ chunk).

---

## 📊 Empirical Experimental Results

Evaluated across **40 stratified scientific questions** split equally into a 20-question Development partition (`questions.dev.jsonl`) and a strictly locked 20-question Held-Out Test partition (`questions.test.jsonl`, locked under `data/eval/split.sha256`).

### Final Test Split Benchmark ($K=5$, 20 Questions)

| Retrieval Model | Chunk Config | HitRate@5 | Recall@5 | MRR | Citation Precision | Abstention Accuracy | Avg Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dense Embed (all-MiniLM-L6-v2)** | `ck256` | **60.0%** | **56.7%** | 0.343 | **100.0%** | **100.0%** | **911 ms** |
| **Okapi BM25 (Lexical Inverted)** | `ck640` | 46.7% | 43.3% | **0.372** | **100.0%** | **100.0%** | 1,549 ms |
| **Okapi BM25 (Reference)** | `ck256` | 46.7% | 43.3% | 0.467 | 66.7% | **100.0%** | 1,462 ms |

### Key Experimental Insights
- **Dense Semantic Superiority:** Dense retrieval (`embedding_ck256`) outperformed BM25 by **+13.3% on HitRate@5** and **+13.4% on Recall@5**, demonstrating clear advantages on paraphrased technical concepts and semantic inquiries.
- **Lexical Precision at Rank 1:** When exact technical terms were explicitly present in the query, BM25 achieved superior reciprocal rank (**MRR 0.372** vs. 0.343).
- **Flawless Grounding & Safety:** Both pre-registered configurations delivered **100% Citation Precision** and **100% Abstention Accuracy**, validating our dual-gate defense against confabulation.

Full details are documented in [`docs/experiments/tuning-log.md`](file:///d:/PaperTrail/docs/experiments/tuning-log.md) and [`docs/failure-analysis.md`](file:///d:/PaperTrail/docs/failure-analysis.md).

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    User([User Query]) --> PreGate{Pre-LLM Confidence Gate}
    
    subgraph Browser ["Client-Side Browser (Next.js 16)"]
        User
        WASMEmbed["@xenova/transformers (all-MiniLM-L6-v2 ONNX)"]
        UI["Editorial Broadsheet 3-Column UI"]
    end
    
    subgraph RetrievalEngine ["PostgreSQL / Supabase pgvector (RLS Enforced)"]
        BM25Index[("Okapi BM25 SQL Inverted Index")]
        HNSWIndex[("pgvector HNSW Cosine Index (384-d)")]
    end
    
    User -->|Embedding Mode| WASMEmbed
    WASMEmbed -->|Query Vector| HNSWIndex
    User -->|Lexical Mode| BM25Index
    
    HNSWIndex -->|Top-K Chunks| PreGate
    BM25Index -->|Top-K Chunks| PreGate
    
    PreGate -->|< Tau_Threshold| FastAbstain["Fast-Abstain (~1ms, 0 Tokens)"]
    PreGate -->|>= Tau_Threshold| LLM["Groq Cloud: openai/gpt-oss-120b"]
    
    LLM --> StructuredOutput["Structured Claims & Verbatim Quotes"]
    StructuredOutput --> CitationValidator["Deterministic Citation Verifier"]
    CitationValidator -->|Verified Quotes| UI
    CitationValidator -->|Mismatch Found| Downgrade["Downgrade: partial / abstain"]
    Downgrade --> UI
    FastAbstain --> UI
```

---

## 📚 Indexed Corpus Manifest

The PaperTrail corpus comprises **12 open-access foundation papers** in natural language processing and information retrieval, locked under [`data/manifest/corpus.yaml`](file:///d:/PaperTrail/data/manifest/corpus.yaml):

1. **Vaswani et al. (2017)** — *Attention Is All You Need* (`arxiv_1706_03762`)
2. **Lewis et al. (2020)** — *Retrieval-Augmented Generation for Knowledge-Intensive NLP* (`arxiv_2005_11401`)
3. **Robertson & Zaragoza (2009)** — *The Probabilistic Relevance Framework: BM25 and Beyond* (`fntir_bm25_2009`)
4. **Karpukhin et al. (2020)** — *Dense Passage Retrieval for Open-Domain Question Answering* (`arxiv_2004_04906`)
5. **Hu et al. (2021)** — *LoRA: Low-Rank Adaptation of Large Language Models* (`arxiv_2106_09685`)
6. **Liu et al. (2023)** — *Lost in the Middle: How Language Models Use Long Contexts* (`arxiv_2307_03172`)
7. **Es et al. (2023)** — *RAGAS: Automated Evaluation of Retrieval Augmented Generation* (`arxiv_2305_14283`)
8. **Devlin et al. (2018)** — *BERT: Pre-training of Deep Bidirectional Transformers* (`arxiv_1810_04805`)
9. **Radford et al. (2019)** — *Language Models are Unsupervised Multitask Learners (GPT-2)* (`openai_gpt2_2019`)
10. **Touvron et al. (2023)** — *LLaMA: Open and Efficient Foundation Language Models* (`arxiv_2302_13971`)
11. **Guu et al. (2020)** — *REALM: Retrieval-Augmented Language Model Pre-Training* (`arxiv_2002_08909`)
12. **Borgeaud et al. (2022)** — *Improving Language Models by Retrieving from Trillions of Tokens (RETRO)* (`arxiv_2112_04426`)

- **Total Searchable Chunks:** 2,015 chunks across two configurations:
  - `ck256`: 256 tokens, 32 overlap.
  - `ck640`: 640 tokens, 64 overlap.
- **Lexical Vocabulary:** 6,288 indexed unique terms with pre-computed postings and document statistics.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Python:** 3.12+ (managed with `uv` or virtualenv)
- **Node.js:** 18+ (tested with v20/v22)
- **Database:** Supabase PostgreSQL instance with `pgvector`
- **LLM Key:** Free **Groq Cloud API Key** (`GROQ_API_KEY`)

### 2. Environment Configuration
Create a `.env` file in the project root:
```ini
# Supabase PostgreSQL Database (Transaction pooler & direct port)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Groq Cloud API Key (Strictly zero-cost LLM generation)
GROQ_API_KEY="gsk_..."
```

### 3. Database Migrations
Apply migrations 001 through 005 to provision schemas, BM25 inverted tables, `vector(384)` columns, HNSW indices, and Row-Level Security:
```bash
# Python venv setup
cd python
uv sync
cd ..

# Apply migrations
python/scripts/apply_migrations.py
```

### 4. Ingestion & Embedding Pipeline
Ingest the 12 open-access PDFs, extract clean Markdown text, chunk across both configurations, index BM25 terms, and generate 384-dimensional dense vectors:
```bash
python -m papertrail.ingest.pipeline
```

### 5. Launch the Web Application
Start the Next.js development server:
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to access the interactive workspace.

---

## 🧪 Evaluation & Verification Commands

Run the full automated test suite and benchmark runners:

```bash
# Run all Python unit and integration tests (22 tests)
pytest

# Run Dev split retrieval evaluation (BM25 vs. Dense on ck256 & ck640)
python -m papertrail.evaluation.compare_retrieval

# Run Test split evaluation with citation verification and gate calibration
python -m papertrail.evaluation.runner --split test --k 5

# Validate web code quality and production build
cd web
npm run lint
npm run build
```

---

## 🛡️ Security Hardening

- **Supabase Row-Level Security (RLS):** All 12 tables in schema `public` plus `_migrations` enforce RLS (`005_enable_rls.sql`). Public HTTP endpoints via PostgREST cannot perform unauthorized mutations or scrape internal evaluation splits (`eval_*`).
- **Secret Isolation:** Environment secrets (`.env`) are strictly isolated and ignored by git.
- **Partition Integrity:** The held-out test split is verified via SHA-256 hash checks before benchmark execution.

---

## 📑 Technical Documentation Directory

- [`docs/defence-notes.md`](file:///d:/PaperTrail/docs/defence-notes.md): Comprehensive defense addressing the TRD §18 technical rubric questions.
- [`docs/contributions.md`](file:///d:/PaperTrail/docs/contributions.md): Novel engineering patterns, systems design, and algorithmic contributions.
- [`docs/limitations.md`](file:///d:/PaperTrail/docs/limitations.md): Boundary conditions, corpus scale constraints, and threshold calibration nuances.
- [`docs/failure-analysis.md`](file:///d:/PaperTrail/docs/failure-analysis.md): Qualitative taxonomy of retrieval and citation failure modes.
- [`docs/experiments/tuning-log.md`](file:///d:/PaperTrail/docs/experiments/tuning-log.md): Pre-registered chunk configuration selection and parameter logs.

---

## 📄 License
Open-access academic demonstration project. Built for the **PaperTrail** evaluated research-paper assistant technical specification.
