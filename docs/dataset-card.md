# PaperTrail Evaluation Dataset Card

## 1. Overview
- **Dataset Name:** `papertrail-eval-v1.0`
- **Total Questions:** 40
- **Splits:** 20 Dev (`questions.dev.jsonl`), 20 Test (`questions.test.jsonl`)
- **Corpus Version:** `v1.0` (12 open-access RAG papers)
- **JSON Schema:** [`data/eval/schema.json`](file:///d:/PaperTrail/data/eval/schema.json)
- **Integrity Hashes:** [`data/eval/split.sha256`](file:///d:/PaperTrail/data/eval/split.sha256)

---

## 2. Category Distribution & Stratification

The questions are partitioned using stratified random sampling with fixed seed `42` to guarantee identical distributions in development and test sets:

| Category | Total | Dev Set | Test Set | Answerability | Purpose |
|----------|-------|---------|----------|---------------|---------|
| `direct_factual` | 10 | 5 | 5 | `answerable` | Single passage retrieval and exact factual grounding |
| `cross_section` | 6 | 3 | 3 | `answerable` | Information synthesis across distinct sections of 1 paper |
| `multi_source` | 6 | 3 | 3 | `answerable` | Comparative synthesis across 2 or more distinct papers |
| `partially_answerable` | 4 | 2 | 2 | `partial` | Tests bounds: answering known parts while abstaining on missing details |
| `unanswerable_in_domain` | 8 | 4 | 4 | `unanswerable` | In-domain RAG queries not present in the 12 corpus papers |
| `out_of_corpus` | 4 | 2 | 2 | `out_of_corpus` | Queries outside ML/NLP (chemistry, sports, astronomy, culinary) |
| `ambiguous` | 2 | 1 | 1 | `unanswerable` | Underspecified queries testing clarificatory abstention |
| **Total** | **40** | **20** | **20** | — | — |

---

## 3. Abstention & Grounding Benchmark

- **Should-Abstain Items:** 12 items (`unanswerable_in_domain` + `out_of_corpus`) specifically test the system's ability to resist hallucinating on ungrounded queries.
- **Gold Evidence:** Every answerable and partial question contains structured gold evidence records:
  ```json
  {
    "doc_id": "lewis-2020-rag",
    "pages": [2, 3],
    "span": "We propose two models: RAG-Sequence... and RAG-Token..."
  }
  ```
  These spans serve as ground truth for computing **Recall@K**, **HitRate@K**, **MRR**, and **nDCG@K**.
