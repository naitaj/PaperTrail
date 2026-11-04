# PaperTrail — System Limitations

This document details the boundary conditions, architectural trade-offs, and empirical limitations of the **PaperTrail** evaluated research-paper assistant as required under TRD §18.

---

## 1. Corpus Scale & Domain Specificity

- **Corpus Breadth:** PaperTrail indexes a curated corpus of 12 foundational open-access computer science papers in computational linguistics, information retrieval, and language modeling (e.g., Vaswani et al., Robertson et al., Lewis et al., Karpukhin et al., Hu et al.).
- **Boundary Limitation:** The knowledge boundary is strictly confined to these 12 indexed papers (2,015 total chunks across `ck256` and `ck640`). Queries outside of this technical domain (e.g., general medicine, physical sciences, world history) or outside this specific literature subset will legitimately trigger the abstention engine.
- **Cross-Paper Syntheses:** While the database supports retrieval across the entire 12-paper corpus simultaneously, complex cross-document comparative reasoning is constrained by Top-$K$ retrieval window limits ($K \in [1, 10]$).

---

## 2. Threshold Calibration & Sample Size

- **Split Partitions:** The evaluation benchmark contains 40 stratified questions divided equally into 20 development questions (`questions.dev.jsonl`) and 20 held-out test questions (`questions.test.jsonl`).
- **Calibration Noise:** Pre-LLM confidence gate thresholds ($\tau_{\text{BM25}} = 11.0$, $\tau_{\text{Dense}} = 0.35$) were empirically calibrated on the 20-question development split to achieve 0% false abstentions on answerable queries while catching out-of-corpus queries. While yielding 100% abstention accuracy on the test split, calibrating thresholds on a 20-sample development partition carries statistical variance ($\pm 5\%$ confidence intervals). Larger corpora would benefit from dynamic quantile-based thresholding.

---

## 3. Retrieval Chunking & Boundary Effects

- **Fixed-Token Windows:** Documents are chunked into fixed-token spans with sliding overlap:
  - `ck256`: 256 tokens, 32-token overlap.
  - `ck640`: 640 tokens, 64-token overlap.
- **Syntactic Truncation:** Despite PyMuPDF structural boundary detection, mathematical formulas, tabular proofs, and multi-sentence algorithmic definitions occasionally straddle chunk boundaries. When a key proposition spans across a chunk boundary, single-chunk retrieval may retrieve an incomplete premise, requiring the user to inspect adjacent context via the Context Expansion Modal (±1 chunk).

---

## 4. Embedding Model Capacity & In-Browser Inference

- **MiniLM Trade-Offs:** We deliberately chose `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions, ~22.7M parameters) to guarantee zero-cost inference, lightweight local indexing via `fastembed`, and direct in-browser query embedding via `@xenova/transformers`.
- **Semantic Limits:** While MiniLM achieves strong cosine separation on technical passages, larger foundation embedding models (e.g., BGE-large, Cohere Embed v3, or 1536-d dense models) offer superior fine-grained semantic discrimination on multi-clause technical negatives and complex syntactic inversions.
- **Browser Cold-Start:** On the first dense query invocation, client-side `@xenova/transformers` downloads the quantized ONNX weights (~23 MB) to the browser cache. Subsequent queries execute in <40ms, but initial cold-start requires network bandwidth.

---

## 5. Single LLM Provider & Inference Rate Limits

- **Zero-Cost Policy:** PaperTrail strictly avoids commercial paid APIs, utilizing **Groq Cloud** for inference with `openai/gpt-oss-120b` (with automatic fallback to `openai/gpt-oss-20b`).
- **Rate-Limit Resilience:** Groq's high-speed LPU infrastructure delivers token generation speeds (>250 tokens/sec), but free-tier quotas enforce minute-by-minute rate limits. During high-concurrency evaluation benchmarking, batch runners must apply jittered exponential backoff (implemented in `python/papertrail/evaluation/runner.py`).
- **Model Non-Determinism:** Even with `temperature = 0.0`, minor non-deterministic floating-point variations in token generation can occur across distinct hardware clusters, though our deterministic citation validation engine standardizes and guarantees claim quote integrity regardless of minor wording variance.

