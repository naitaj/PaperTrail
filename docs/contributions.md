# PaperTrail — Engineering & Design Contributions

This document highlights the novel technical contributions, systems design patterns, and architectural innovations implemented in **PaperTrail**.

---

## 1. Pure SQL Okapi BM25 Implementation

Rather than provisioning heavy external search engines (such as Elasticsearch, OpenSearch, or Meilisearch), PaperTrail implements the exact **Okapi BM25** probabilistic relevance ranking algorithm directly inside **PostgreSQL**:

- **Mathematical Fidelity:** Computes inverse document frequency (IDF) with Robertson-Spärck Jones weighting:
  $$\text{IDF}(q_i) = \ln\left(\frac{N - n(q_i) + 0.5}{n(q_i) + 0.5} + 1\right)$$
  and term frequency saturation with document length normalization ($k_1 = 1.2$, $b = 0.75$):
  $$\text{TF}_{\text{norm}}(q_i, D) = \frac{f(q_i, D) \cdot (k_1 + 1)}{f(q_i, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$
- **Database Indexing:** Backed by normalized relational tables (`bm25_terms`, `bm25_postings`, `bm25_doc_stats`) with B-tree indices on `(term, config_id)`.
- **Zero Extra Infrastructure:** Enables transactional consistency, zero synchronization drift between vector embeddings and lexical indices, and zero maintenance overhead for external search clusters.

---

## 2. Zero-Cost Dual-Environment Embedding Architecture

PaperTrail achieves complete cloud embedding independence through a symmetrical dual-environment design using `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions):

- **Server-Side Ingestion (Python):** Utilizes `fastembed` for batch quantization and parallel embedding generation during document ingestion, directly streaming normalized vectors into Supabase's `pgvector` extension with HNSW cosine indexing.
- **Client-Side Query Embedding (Browser):** Utilizes `@xenova/transformers` to run the identical MiniLM ONNX model locally in the user's browser using WebAssembly.
- **Benefits:** Zero embedding API costs, zero vendor lock-in, zero query leakage to commercial embedding providers, and sub-40ms client query embedding latency.

---

## 3. Pre-LLM Confidence Gating & Fast Abstention

To solve the twin problems of LLM hallucination and unnecessary token consumption on out-of-domain or ungroundable queries:

- **Sub-Millisecond Fast-Fail:** Evaluates top retrieval relevance scores before dispatching queries to the LLM:
  - Lexical threshold: $\tau_{\text{BM25}} = 11.0$
  - Dense cosine similarity threshold: $\tau_{\text{Dense}} = 0.35$
- **Efficiency:** Fast-abstains in **~1 ms** consuming **0 LLM tokens**.
- **Accuracy:** Achieved **100% abstention accuracy** on the held-out test split, completely preventing confabulation when faced with ungrounded inputs.

---

## 4. Deterministic Citation Validation & Status Downgrading

PaperTrail enforces a zero-trust model between the LLM output and the end user:

- **Verbatim Span Extraction:** Requires the generator to return structured claim objects containing explicit chunk IDs and verbatim passage quotes.
- **String Normalization:** Strips trailing punctuation, typographical whitespace, and non-breaking characters to prevent false validation rejections.
- **Automated Downgrading:** If a claim's quoted passage cannot be verified as an exact substring within the referenced chunk payload:
  - If some claims verify: Status is downgraded to `partial`.
  - If no claims verify: Status is downgraded to `abstain`.
- **Benchmark Result:** Delivered **100% Citation Precision** on both BM25 and Dense configurations on the test benchmark.

---

## 5. Google Stitch "Editorial Broadsheet & Academic Ledger" UI

Rather than generic modern SaaS dashboards, PaperTrail incorporates a bespoke design system created in Google Stitch:

- **Aesthetic Authority:** Recreates the tactile restraint of broadsheet folios and archival ledgers using `Cinzel`, `Playfair Display`, `Source Serif 4`, `EB Garamond`, and `JetBrains Mono`.
- **Planar Hierarchy:** 0px border-radius, hairline ink borders (`#747683`), and warm laid-paper palette (`#fff8f4` surface, `#001d5f` primary indigo, `#fe6f3b` cinnabar accent).
- **Interactive Verification Spread:**
  - Left: Filterable archival index with live corpus scope toggle.
  - Middle: Scholarly query desk with real-time character accounting and algorithmic controls.
  - Right: Ruled bibliographic docket with interactive superscript citation cross-highlighting.
  - Modal: Archival context expansion sheet displaying preceding and succeeding manuscript chunks ($\pm 1$ chunk).

---

## 6. Hardened Supabase PostgreSQL & Row-Level Security

- Applied migration `005_enable_rls.sql` enabling Row-Level Security on all 12 public schema tables and `_migrations`.
- Revoked mutation privileges from public API roles (`anon`, `authenticated`), protecting against unauthorized PostgREST tampering while preserving sub-10ms pooled connection queries for the Next.js server and Python evaluation engines.

