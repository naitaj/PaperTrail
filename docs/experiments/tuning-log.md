# PaperTrail Tuning Log & Chunk Selection Pre-Registration (Phase 4)

This log records the development-split experimental findings and commits the chunk configuration selection before running any final evaluation on the isolated test split (`data/eval/questions.test.jsonl`, locked with `split.sha256`).

---

## 1. P1 Development Split Retrieval & Generation Benchmark (20 Questions, K=5)

**Environment**:
- Database: Supabase PostgreSQL with `pgvector`
- Embedding Model: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions, local fastembed)
- Generation Model: Groq `openai/gpt-oss-120b` (temperature 0.0, JSON mode)
- Date Evaluated: Phase 4 Milestone

### Results Table

| Configuration | Chunk Config | HitRate@5 | Recall@5 | MRR | Citation Verbatim Precision | Abstention Accuracy | Mean Latency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **BM25 Lexical** | `ck640` | **53.3%** | **50.0%** | **0.406** | **100.0%** | **100.0%** | 1,449 ms |
| **BM25 Lexical** | `ck256` | 46.7% | 46.7% | 0.380 | 86.7% | 80.0% | 1,909 ms |
| **Dense Embedding** | `ck256` | **53.3%** | **50.0%** | 0.283 | 66.7% | **100.0%** | 1,245 ms |
| **Dense Embedding** | `ck640` | 40.0% | 36.7% | 0.256 | 100.0% | 100.0% | **1,140 ms** |

---

## 2. Pre-Registered Chunk Configuration Selection Rule (TRD §10, §16)

### Analysis:
1. **Lexical Retrieval**:
   - `ck640` strongly outperforms `ck256` across all primary metrics: +6.6% HitRate@5 (53.3% vs. 46.7%), +3.3% Recall@5 (50.0% vs. 46.7%), and higher MRR (0.406 vs. 0.380).
   - In generation, `ck640` provides broader contextual coherence, achieving **100.0% verbatim quote verification** and **100.0% abstention accuracy** on unanswerable questions.
2. **Dense Embedding Retrieval**:
   - `ck256` outperforms `ck640` in retrieval recall (50.0% vs. 36.7%) because dense sentence-transformer pooling retains sharper semantic signal on 256-token windows than 640-token windows.

### Formal Selection:
- **Headline Primary Configuration**: **BM25 with `ck640`** is selected as the primary baseline configuration for the final benchmark.
- **Comparative Embedding Configuration**: **Dense Embedding with `ck256`** is selected as the representative dense retrieval challenger.

This selection is now committed prior to unblinding the test split.

