# PaperTrail: Retrieval Experiment Design & Controlled Variables

## 1. Research Question
*How does exact dense vector retrieval (cosine similarity over `text-embedding-3-small` embeddings) compare to an in-database Okapi BM25 lexical retriever across chunking granularities (`ck256` vs `ck640`) in terms of retrieval quality, end-to-end answer faithfulness, citation precision, and abstention reliability on a research corpus?*

---

## 2. Controlled Variables (Fixed Snapshot)

To ensure fair and reproducible comparison, the following variables are strictly held constant across all headline runs:

| Variable | Controlled Value | Rationale |
|----------|-----------------|-----------|
| **Corpus Version** | `v1.0` (12 verified papers, SHA-256 locked) | Prevents document drift |
| **Top-K Retrieval** | `k = 5` | Standard academic RAG retrieval depth |
| **Context Window Budget** | `3,000 tokens` (maximum 8 passages) | Constant prompt load across conditions |
| **Generation Model** | `claude-3-5-sonnet-20241022` | Identical generation capacity |
| **Sampling Temperature** | `0.0` | Maximizes determinism and citation adherence |
| **System Prompt Version** | `v1.0` (Untrusted-data framing, tool-use schema) | Same instructions and citation format |
| **Evaluation Splits** | Fixed seed stratified split (Dev: 20, Test: 20) | Prevents test set contamination |
| **Repeated Runs** | 3 independent repeats per question | Enables variance and stability reporting |

---

## 3. Independent Variables (Matrix)

We evaluate a 2 x 2 matrix:
1. **Retriever Type**:
   - `lexical`: PostgreSQL Okapi BM25 (`k1=1.2`, `b=0.75`) via stored `tsvector` and `lexical_terms`
   - `embedding`: OpenAI `text-embedding-3-small` (1536 dims, pgvector exact cosine scan)
   - *(Optional Hybrid)*: Reciprocal Rank Fusion (`RRF-60`)

2. **Chunk Configuration**:
   - `ck256`: Target 256 tokens, 48 token overlap, page bounded
   - `ck640`: Target 640 tokens, 96 token overlap, page bounded

---

## 4. Evaluation Metrics

- **Retrieval Metrics (Gold Passages)**: Recall@5, HitRate@5, MRR, nDCG@5
- **Generation Quality**: Claim-level citation precision, answer faithfulness (human annotated + judge agreement)
- **Abstention Reliability**: Precision and Recall on unanswerable and out-of-corpus queries
- **Operational Costs**: Latency (p50, p95 ms), token usage, cost per query (USD)
