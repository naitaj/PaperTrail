# PaperTrail Corpus Documentation

## 1. Domain and Topic Selection

**Topic:** *Retrieval-Augmented Generation: Architectures, Evaluation, and Hallucination Mitigation*  
**Corpus Version:** `v1.0`  
**Size:** 12 open-access research papers (NeurIPS, ICML, EMNLP, ICLR, SIGIR, TACL, arXiv)

### Rationale
This topic forms the foundational basis for modern knowledge-grounded AI systems:
- It includes seminal models comparing dense passage retrieval against lexical BM25 (`karpukhin-2020-dpr`, `khattab-2020-colbert`, `lewis-2020-rag`).
- It covers architectural paradigms: end-to-end training (`guu-2020-realm`), frozen retrieval at scale (`borgeaud-2022-retro`), and corrective self-reflection (`asai-2023-self-rag`, `yan-2024-crag`).
- It covers key failure modes and evaluations: context position effects (`liu-2023-lost-in-middle`), hallucination reduction (`shuster-2021-retrieval-augmentation`), atomic fact precision (`min-2023-factscore`), and automated RAG evaluation frameworks (`es-2023-ragas`).
- The papers exhibit rich cross-citation, distinct tables, shared benchmarks (Natural Questions, TriviaQA), and explicit design trade-offs, making the corpus ideal for testing factual retrieval, cross-paper comparison, and abstention on out-of-corpus queries.

---

## 2. Included Papers and Licensing

| Document ID | Title | Venue / Year | License / Access |
|-------------|-------|--------------|-------------------|
| `lewis-2020-rag` | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks | NeurIPS 2020 | arXiv Open Access |
| `guu-2020-realm` | REALM: Retrieval-Augmented Language Model Pre-Training | ICML 2020 | arXiv Open Access |
| `karpukhin-2020-dpr` | Dense Passage Retrieval for Open-Domain Question Answering | EMNLP 2020 | arXiv Open Access |
| `khattab-2020-colbert` | ColBERT: Contextualized Late Interaction over BERT | SIGIR 2020 | arXiv Open Access |
| `shuster-2021-retrieval-augmentation` | Retrieval Augmentation Reduces Hallucination in Conversation | EMNLP Findings 2021 | arXiv Open Access |
| `borgeaud-2022-retro` | Improving Language Models by Retrieving from Trillions of Tokens | ICML 2022 | arXiv Open Access |
| `liu-2023-lost-in-middle` | Lost in the Middle: How Language Models Use Long Contexts | TACL 2024 | arXiv Open Access |
| `min-2023-factscore` | FActScore: Fine-grained Atomic Evaluation of Factual Precision | EMNLP 2023 | arXiv Open Access |
| `es-2023-ragas` | Ragas: Automated Evaluation of Retrieval Augmented Generation | EACL 2024 | arXiv Open Access |
| `asai-2023-self-rag` | Self-RAG: Learning to Retrieve, Generate, and Critique | ICLR 2024 | arXiv Open Access |
| `gao-2023-rag-survey` | Retrieval-Augmented Generation for Large Language Models: A Survey | arXiv 2023 | arXiv Open Access |
| `yan-2024-crag` | Corrective Retrieval Augmented Generation | arXiv 2024 | arXiv Open Access |

---

## 3. Storage and Checksums

- Raw PDF files are fetched directly from official repository URLs (`https://arxiv.org/pdf/<id>.pdf`) into `data/raw/<doc_id>.pdf`.
- SHA-256 checksums are calculated on download and written to `data/manifest/corpus.yaml` to ensure immutable and reproducible ingestion.
- The `data/raw/` directory is excluded from git version control via `.gitignore`, while the manifest ensures automated fetching.
