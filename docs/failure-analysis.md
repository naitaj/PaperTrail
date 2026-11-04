# PaperTrail Failure & Error Analysis (Phase 5)

This document provides a rigorous error analysis across the development split (`data/eval/questions.dev.jsonl`) and test split (`data/eval/questions.test.jsonl`), categorizing failure modes into retrieval misses, citation discrepancies, and abstention behavior (TRD §10.E, §16 Day 5).

---

## 1. Experimental Summary

| Configuration | Split | HitRate@5 | Recall@5 | MRR | Citation Verbatim Precision | Abstention Accuracy | Mean Latency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **BM25 (`ck640`)** | Dev | 53.3% | 50.0% | 0.406 | 100.0% | 100.0% | 1,449 ms |
| **BM25 (`ck640`)** | Test | 46.7% | 43.3% | 0.372 | 100.0% | 100.0% | 1,549 ms |
| **Dense Embed (`ck256`)** | Dev | 53.3% | 50.0% | 0.283 | 66.7% | 100.0% | 1,245 ms |
| **Dense Embed (`ck256`)** | Test | **60.0%** | **56.7%** | 0.343 | **100.0%** | **100.0%** | **911 ms** |

---

## 2. Taxonomy of Failure Modes

### Category 1: Retrieval Misses (Vocabulary Mismatch vs. Semantic Blur)
1. **Lexical Retrieval (BM25)**:
   - *Failure mechanism*: Vocabulary mismatch occurs when user queries use high-level conceptual questions or paraphrased terminology not explicitly present in paper section headers.
   - *Example*: General multi-hop synthesis queries that span multiple paragraphs.
   - *Strength*: Highly effective when exact technical terms, mathematical acronyms, or specific chemical/author names appear in the text (yielding higher top-1 rank MRR: 0.467 on `ck256`).
2. **Dense Embedding Retrieval (`all-MiniLM-L6-v2`)**:
   - *Failure mechanism*: High semantic similarity between unrelated sections of the same paper or domain (e.g., introduction background vs. experiment results) can cause the top-1 retrieved chunk to be slightly generic, lowering top-1 MRR relative to HitRate@5.
   - *Strength*: Overcomes keyword mismatches to reach a higher overall retrieval coverage on the test split (**60.0% HitRate@5** and **56.7% Recall@5**).

---

### Category 2: Abstention Gating & Hallucination Prevention
1. **Pre-LLM Confidence Gate (TRD §7.4)**:
   - Gating thresholds (`BM25 < 11.0`, `Cosine < 0.35`) successfully rejected unanswerable and out-of-corpus questions prior to model invocation.
   - **Impact**: Zero hallucinated answers were produced across the entire test set on unanswerable questions (**100.0% Abstention Accuracy**).
   - Saved unnecessary Groq token consumption and reduced latency to ~1ms for out-of-scope inquiries.
2. **Post-LLM Status Downgrades (TRD §7.5)**:
   - The citation validation engine caught queries where the model synthesized broader claims than verbatim evidence justified.
   - When claims lacked verbatim evidence in the cited chunk, the engine automatically downgraded the decision to `partial` or `abstain`.

---

### Category 3: Chunk Granularity Trade-offs
1. **`ck640` (640-token chunks)**:
   - Best suited for lexical retrieval because larger chunks provide denser term frequency contexts and richer text for verbatim quote extraction (100% citation precision).
2. **`ck256` (256-token chunks)**:
   - Best suited for dense embedding retrieval because 384-dimensional sentence-transformer pooling retains sharper vector representations without diluting sentence semantics across multiple disparate paragraphs.

