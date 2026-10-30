"""Script to construct, validate, and split the 40-question evaluation dataset.
Implements requirements PRD FR-EVL-01, FR-EVL-02 and TRD §10.A.
"""

import hashlib
import json
import random
from pathlib import Path
import jsonschema

ROOT_DIR = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT_DIR / "data" / "eval" / "schema.json"
DEV_PATH = ROOT_DIR / "data" / "eval" / "questions.dev.jsonl"
TEST_PATH = ROOT_DIR / "data" / "eval" / "questions.test.jsonl"
HASH_PATH = ROOT_DIR / "data" / "eval" / "split.sha256"

# 40 Gold-Standard Questions across 7 categories
QUESTIONS = [
    # ---- 1. Direct Factual (10 items) ----
    {
        "question_id": "q-fact-01",
        "question": "What two formulations of retrieval-augmented generation models are introduced by Lewis et al. (2020)?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "Lewis et al. introduce RAG-Sequence, which uses the same retrieved passage to generate the entire sequence, and RAG-Token, which can use different retrieved passages to generate each token.",
        "gold_evidence": [
            {
                "doc_id": "lewis-2020-rag",
                "pages": [2, 3],
                "span": "We propose two models: RAG-Sequence, which uses the same retrieved document to generate the complete sequence, and RAG-Token, which can use different passages per token."
            }
        ]
    },
    {
        "question_id": "q-fact-02",
        "question": "In REALM (Guu et al., 2020), what auxiliary pre-training task is used to guide the neural retriever?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "REALM pre-trains the retriever using a masked language modeling (MLM) objective over a knowledge corpus via an unsupervised neural retrieval step.",
        "gold_evidence": [
            {
                "doc_id": "guu-2020-realm",
                "pages": [1, 2],
                "span": "REALM augments language model pre-training with a latent knowledge retriever that attends over a large text corpus, trained end-to-end via masked language modeling."
            }
        ]
    },
    {
        "question_id": "q-fact-03",
        "question": "What dual-encoder architecture and training objective does DPR (Karpukhin et al., 2020) employ for dense passage retrieval?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "DPR uses two separate BERT networks (one for queries, one for passages) and trains them using negative log-likelihood loss with in-batch negatives.",
        "gold_evidence": [
            {
                "doc_id": "karpukhin-2020-dpr",
                "pages": [2, 3],
                "span": "DPR uses a dual-encoder architecture with two independent BERT networks for queries and passages, optimized with negative log-likelihood loss."
            }
        ]
    },
    {
        "question_id": "q-fact-04",
        "question": "What scoring mechanism does ColBERT (Khattab & Zaharia, 2020) use to compute relevance between query and document token embeddings?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "ColBERT uses a late-interaction mechanism called MaxSim, computing the sum of maximum cosine similarities between each query token embedding and all document token embeddings.",
        "gold_evidence": [
            {
                "doc_id": "khattab-2020-colbert",
                "pages": [2, 3],
                "span": "ColBERT introduces late interaction via the MaxSim operator, which computes the sum of maximal inner products between query token representations and document token representations."
            }
        ]
    },
    {
        "question_id": "q-fact-05",
        "question": "According to Shuster et al. (2021), how does retrieval augmentation affect hallucination in conversational neural models?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "Retrieval augmentation substantially reduces conversational hallucination rates across open-domain dialogue benchmarks by grounding responses in retrieved factual knowledge passages.",
        "gold_evidence": [
            {
                "doc_id": "shuster-2021-retrieval-augmentation",
                "pages": [1, 2],
                "span": "We show that retrieval augmentation drastically reduces hallucination in dialogue, improving factual accuracy on knowledge-intensive conversation tasks."
            }
        ]
    },
    {
        "question_id": "q-fact-06",
        "question": "Into what chunk size does RETRO (Borgeaud et al., 2022) divide input text sequences to retrieve nearest neighbours from its database?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "RETRO splits the input sequence into 64-token chunks and retrieves nearest neighbours for each 64-token chunk from a 2-trillion-token database.",
        "gold_evidence": [
            {
                "doc_id": "borgeaud-2022-retro",
                "pages": [2, 3],
                "span": "The input sequence is split into chunks of 64 tokens. For each chunk, RETRO retrieves nearest-neighbour chunks from a 2-trillion token database."
            }
        ]
    },
    {
        "question_id": "q-fact-07",
        "question": "According to Liu et al. (2023) in 'Lost in the Middle', how does the position of relevant information within the context window affect LLM retrieval performance?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "Language models exhibit a U-shaped performance curve: performance is highest when relevant information appears at the beginning or very end of the input context, and degrades significantly when placed in the middle.",
        "gold_evidence": [
            {
                "doc_id": "liu-2023-lost-in-middle",
                "pages": [1, 3],
                "span": "Performance is highest when relevant information occurs at the beginning or end of the input context, and drops markedly when models must access relevant information in the middle of long contexts."
            }
        ]
    },
    {
        "question_id": "q-fact-08",
        "question": "What atomic evaluation unit does FActScore (Min et al., 2023) decompose generated text into to measure factual precision?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "FActScore decomposes generated text into individual atomic facts (short sentences expressing a single fact) and checks whether each atomic fact is supported by the knowledge source.",
        "gold_evidence": [
            {
                "doc_id": "min-2023-factscore",
                "pages": [2, 3],
                "span": "FActScore breaks down a generated text into a sequence of atomic facts, each evaluated individually for support by a reliable knowledge source."
            }
        ]
    },
    {
        "question_id": "q-fact-09",
        "question": "What three core quality aspects does Ragas (Es et al., 2023) evaluate in retrieval-augmented generation systems?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "Ragas evaluates faithfulness (grounding in context), answer relevance (answering the prompt), and context relevance (retrieval precision).",
        "gold_evidence": [
            {
                "doc_id": "es-2023-ragas",
                "pages": [1, 2],
                "span": "Ragas focuses on evaluating three core dimensions without reference human labels: faithfulness of the answer to the context, answer relevance to the query, and context relevance of retrieved passages."
            }
        ]
    },
    {
        "question_id": "q-fact-10",
        "question": "What special reflection tokens does Self-RAG (Asai et al., 2023) generate to dynamically critique retrieved content and its own outputs?",
        "category": "direct_factual",
        "answerability": "answerable",
        "reference_answer": "Self-RAG uses special reflection tokens including Retrieve (deciding whether to fetch), IsRel (relevance of retrieved context), IsSup (groundedness / support), and IsUse (usefulness of generated response).",
        "gold_evidence": [
            {
                "doc_id": "asai-2023-self-rag",
                "pages": [2, 3],
                "span": "Self-RAG generates reflection tokens categorized into Retrieve, IsRel (context relevance), IsSup (groundedness/support), and IsUse (utility/quality) to self-evaluate outputs."
            }
        ]
    },

    # ---- 2. Cross-Section (6 items) ----
    {
        "question_id": "q-cross-01",
        "question": "In Lewis et al. (2020), how does the architectural definition of RAG-Sequence in Section 2 relate to the beam search decoding procedure described in Section 2.3?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "RAG-Sequence treats the retrieved document as a latent variable that is fixed throughout the entire sequence, requiring a modified thorough beam search that marginalizes across hypotheses across different documents.",
        "gold_evidence": [
            {
                "doc_id": "lewis-2020-rag",
                "pages": [3, 4],
                "span": "For RAG-Sequence, decoding cannot be solved with standard beam search because probabilities do not factorize token-by-token. We perform thorough decoding using separate beams per document and aggregating scores."
            }
        ]
    },
    {
        "question_id": "q-cross-02",
        "question": "In Karpukhin et al. (2020), how does the hard negative sampling strategy in Section 3 impact the top-20 retrieval accuracy on Natural Questions shown in Table 2?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "Selecting hard negatives using BM25 alongside in-batch random negatives significantly improves top-20 retrieval accuracy compared to using random negatives alone.",
        "gold_evidence": [
            {
                "doc_id": "karpukhin-2020-dpr",
                "pages": [3, 5],
                "span": "Training with BM25 hard negatives in addition to in-batch negatives yields a dramatic increase in top-20 accuracy from 67.7% to 78.4% on Natural Questions."
            }
        ]
    },
    {
        "question_id": "q-cross-03",
        "question": "In Khattab & Zaharia (2020), how does ColBERT's offline indexing phase in Section 4 enable the sub-100ms query latency reported in Section 5?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "ColBERT pre-computes and indexes all document token embeddings offline using vector quantization and inverted list pruning, allowing fast GPU/CPU vector gather and MaxSim scoring at query time.",
        "gold_evidence": [
            {
                "doc_id": "khattab-2020-colbert",
                "pages": [4, 6],
                "span": "By pre-computing all token representations for documents and indexing them with vector quantization, ColBERT avoids re-encoding documents, achieving sub-100ms latency on large corpora."
            }
        ]
    },
    {
        "question_id": "q-cross-04",
        "question": "In Liu et al. (2023), how does context performance vary between the synthetic key-value retrieval task in Section 4 and the natural multi-document QA task in Section 3?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "Both tasks demonstrate the same characteristic U-shaped degradation in the middle of long contexts, confirming that position bias is architectural rather than specific to QA text formatting.",
        "gold_evidence": [
            {
                "doc_id": "liu-2023-lost-in-middle",
                "pages": [4, 7],
                "span": "The key-value retrieval experiment in Section 4 mirrors the multi-document QA results from Section 3: models reliably retrieve keys located at the beginning or end, but suffer steep degradation when the key is placed in the interior."
            }
        ]
    },
    {
        "question_id": "q-cross-05",
        "question": "In Asai et al. (2023), how does Self-RAG's critic model training in Section 3.2 differ from the generator model training in Section 3.3?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "The critic model is trained using prompting and GPT-4 annotations to output reflection token labels, whereas the generator model is trained on corpus text interleaved with reflection tokens produced by the critic.",
        "gold_evidence": [
            {
                "doc_id": "asai-2023-self-rag",
                "pages": [3, 4],
                "span": "We first train a Critic model to generate reflection tokens using offline curated demonstrations. We then use the Critic to label raw training data, on which the Generator model is trained."
            }
        ]
    },
    {
        "question_id": "q-cross-06",
        "question": "In Yan et al. (2024), how does CRAG's retrieval evaluator determine when to trigger corrective web search versus internal passage refinement?",
        "category": "cross_section",
        "answerability": "answerable",
        "reference_answer": "CRAG evaluates retrieval confidence against two thresholds: if confidence is high, it refines internal passages; if confidence is low, it triggers external web search; if ambiguous, it combines both.",
        "gold_evidence": [
            {
                "doc_id": "yan-2024-crag",
                "pages": [3, 4],
                "span": "CRAG uses an evaluator that outputs confidence scores mapped to three actions: Correct (decompose internal documents), Incorrect (trigger external search), and Ambiguous (combine both sources)."
            }
        ]
    },

    # ---- 3. Multi-Source (6 items) ----
    {
        "question_id": "q-multi-01",
        "question": "Compare the chunk granularity choices between DPR (Karpukhin et al., 2020) and RETRO (Borgeaud et al., 2022).",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "DPR divides documents into 100-word passages without crossing boundaries, whereas RETRO segments text into much smaller 64-token chunks and retrieves nearest neighbours at the chunk level.",
        "gold_evidence": [
            {
                "doc_id": "karpukhin-2020-dpr",
                "pages": [3],
                "span": "We split Wikipedia into disjoint text passages of 100 words as the basic retrieval unit."
            },
            {
                "doc_id": "borgeaud-2022-retro",
                "pages": [2],
                "span": "We split the tokenized text into chunks of 64 tokens, constructing our key-value index over these 64-token chunks."
            }
        ]
    },
    {
        "question_id": "q-multi-02",
        "question": "How do ColBERT (Khattab & Zaharia, 2020) and DPR (Karpukhin et al., 2020) differ in how they represent queries and passages in vector space?",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "DPR collapses the entire query and passage into single 768-dimensional CLS vectors, whereas ColBERT retains multi-vector token embeddings for all tokens and computes late interaction MaxSim.",
        "gold_evidence": [
            {
                "doc_id": "karpukhin-2020-dpr",
                "pages": [2],
                "span": "DPR uses the representation of the [CLS] token to produce a single 768-dimensional embedding for the entire passage."
            },
            {
                "doc_id": "khattab-2020-colbert",
                "pages": [2],
                "span": "ColBERT preserves token-level embeddings for every token in the query and document, avoiding collapsing text into a single vector."
            }
        ]
    },
    {
        "question_id": "q-multi-03",
        "question": "Contrast the evaluation methodologies of RAGAS (Es et al., 2023) and FActScore (Min et al., 2023) for measuring response hallucination.",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "RAGAS evaluates faithfulness by prompting an LLM to check if statements in the answer are inferred from retrieved context, while FActScore breaks text into fine-grained atomic facts and computes the precision of supported facts against a knowledge base.",
        "gold_evidence": [
            {
                "doc_id": "es-2023-ragas",
                "pages": [2],
                "span": "Faithfulness measures the proportion of claims made in the generated answer that can be inferred directly from the provided context using prompting."
            },
            {
                "doc_id": "min-2023-factscore",
                "pages": [2],
                "span": "FActScore segments long-form generation into discrete atomic facts, calculating the percentage of atomic facts supported by evidence."
            }
        ]
    },
    {
        "question_id": "q-multi-04",
        "question": "How do REALM (Guu et al., 2020) and Lewis et al. (2020) RAG differ in how the retriever parameters are trained?",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "REALM pre-trains its dense retriever end-to-end from scratch using masked language modeling gradients, while Lewis et al. RAG initializes its retriever with pre-trained DPR weights and fine-tunes only on downstream task loss.",
        "gold_evidence": [
            {
                "doc_id": "guu-2020-realm",
                "pages": [2],
                "span": "REALM trains the dense retrieval network end-to-end during pre-training using masked language model loss without supervised query-document pairs."
            },
            {
                "doc_id": "lewis-2020-rag",
                "pages": [3],
                "span": "We initialize our retriever with pre-trained DPR models and keep the document index fixed, updating query encoder parameters during fine-tuning."
            }
        ]
    },
    {
        "question_id": "q-multi-05",
        "question": "Compare the adaptive retrieval strategies in Self-RAG (Asai et al., 2023) and CRAG (Yan et al., 2024).",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "Self-RAG learns special 'Retrieve' tokens to decide on demand whether to retrieve during token generation, whereas CRAG uses an external retrieval evaluator module with confidence thresholds to trigger web search or document filtering.",
        "gold_evidence": [
            {
                "doc_id": "asai-2023-self-rag",
                "pages": [2],
                "span": "Self-RAG dynamically determines when to retrieve by generating special [Retrieve] tokens on a per-segment basis."
            },
            {
                "doc_id": "yan-2024-crag",
                "pages": [2],
                "span": "CRAG designs an external retrieval evaluator that assesses the quality of retrieved documents and determines corrective execution branches."
            }
        ]
    },
    {
        "question_id": "q-multi-06",
        "question": "How do Shuster et al. (2021) and Liu et al. (2023) each assess the vulnerability of generative language models to misleading context?",
        "category": "multi_source",
        "answerability": "answerable",
        "reference_answer": "Shuster et al. show that models hallucinate when retrieved context is irrelevant or noisy, while Liu et al. show that models fail to locate and utilize correct context when it is buried among distractor documents in the middle.",
        "gold_evidence": [
            {
                "doc_id": "shuster-2021-retrieval-augmentation",
                "pages": [4],
                "span": "We observe that when retrieved knowledge is of poor quality or misleading, the generator often echoes incorrect context or hallucinates."
            },
            {
                "doc_id": "liu-2023-lost-in-middle",
                "pages": [4],
                "span": "Adding distractor documents significantly degrades retrieval accuracy, especially when the single relevant document is located in the middle of the context."
            }
        ]
    },

    # ---- 4. Partially Answerable (4 items) ----
    {
        "question_id": "q-part-01",
        "question": "What hardware acceleration devices were used to train REALM and RETRO, and what was the exact financial cost in USD of the electricity consumed?",
        "category": "partially_answerable",
        "answerability": "partial",
        "reference_answer": "The papers specify hardware architectures (TPU v3 pods for REALM, TPU v3/v4 for RETRO), but neither paper discloses the financial cost in USD or kilowatt-hours of the electricity consumed.",
        "gold_evidence": [
            {
                "doc_id": "guu-2020-realm",
                "pages": [5],
                "span": "Pre-training was conducted on Google Cloud TPU v3 pods."
            },
            {
                "doc_id": "borgeaud-2022-retro",
                "pages": [14],
                "span": "RETRO models were trained on TPU v3 and TPU v4 infrastructure."
            }
        ]
    },
    {
        "question_id": "q-part-02",
        "question": "What parameter sizes does Self-RAG evaluate, and what is its inference latency on an Apple M3 Max MacBook?",
        "category": "partially_answerable",
        "answerability": "partial",
        "reference_answer": "Self-RAG specifies evaluation on 7B and 13B parameter model sizes based on Llama-2, but does not provide benchmarks for Apple M3 Max hardware.",
        "gold_evidence": [
            {
                "doc_id": "asai-2023-self-rag",
                "pages": [5],
                "span": "We instantiate Self-RAG using Llama-2 7B and 13B base architectures."
            }
        ]
    },
    {
        "question_id": "q-part-03",
        "question": "What knowledge base is used to evaluate FActScore, and how well does FActScore correlate with human judgment on Spanish medical transcripts?",
        "category": "partially_answerable",
        "answerability": "partial",
        "reference_answer": "FActScore is evaluated using English Wikipedia biographical entries; the paper does not evaluate Spanish medical transcripts.",
        "gold_evidence": [
            {
                "doc_id": "min-2023-factscore",
                "pages": [3],
                "span": "We test FActScore on generated biographies of people from English Wikipedia."
            }
        ]
    },
    {
        "question_id": "q-part-04",
        "question": "What index compression mechanisms does ColBERT implement, and what is its index build time on a Raspberry Pi 5?",
        "category": "partially_answerable",
        "answerability": "partial",
        "reference_answer": "ColBERT describes vector quantization and token pruning for compression, but does not test on Raspberry Pi 5 single-board computers.",
        "gold_evidence": [
            {
                "doc_id": "khattab-2020-colbert",
                "pages": [5],
                "span": "ColBERT uses multi-vector indexing and pruning strategies to compress token representations."
            }
        ]
    },

    # ---- 5. Unanswerable In-Domain (8 items) ----
    {
        "question_id": "q-unans-01",
        "question": "How does GraphRAG use the Leiden community detection algorithm to construct hierarchical summarization trees over knowledge graphs?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-02",
        "question": "What is the memory consumption difference between Qdrant and Milvus when building HNSW vector indexes over 50 million 1536-dimensional vectors?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-03",
        "question": "How does the SPLADE v2 learned sparse expansion algorithm perform compared to BM25 on the BEIR benchmark?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-04",
        "question": "What prompt token compression ratio does LLMLingua-2 achieve on LongBench meeting summarization tasks?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-05",
        "question": "How does Speculative RAG train a smaller draft model to verify retrieved candidates in parallel with a target model?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-06",
        "question": "What chunk overlap ratio is recommended for optical character recognition of scanned legal contracts in DocArray?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-07",
        "question": "How does ColBERTv2 compress residual vectors into 2 bits per dimension using centroid k-means clustering?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-unans-08",
        "question": "What are the rate limits and pricing per 1,000 requests for Cohere's commercial Rerank v3 English endpoint?",
        "category": "unanswerable_in_domain",
        "answerability": "unanswerable",
        "reference_answer": None,
        "gold_evidence": []
    },

    # ---- 6. Out-of-Corpus (4 items) ----
    {
        "question_id": "q-ooc-01",
        "question": "What is the chemical reaction mechanism and stoichiometric equation for the esterification of salicylic acid to synthesize acetylsalicylic acid?",
        "category": "out_of_corpus",
        "answerability": "out_of_corpus",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-ooc-02",
        "question": "Which professional tennis player won the Wimbledon Men's Singles final in July 2023 and in how many sets?",
        "category": "out_of_corpus",
        "answerability": "out_of_corpus",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-ooc-03",
        "question": "What is the approximate distance in light-years between the Earth and the Andromeda Galaxy (M31)?",
        "category": "out_of_corpus",
        "answerability": "out_of_corpus",
        "reference_answer": None,
        "gold_evidence": []
    },
    {
        "question_id": "q-ooc-04",
        "question": "What are the primary vegetable ingredients and herbs used in a classical Provencal French ratatouille?",
        "category": "out_of_corpus",
        "answerability": "out_of_corpus",
        "reference_answer": None,
        "gold_evidence": []
    },

    # ---- 7. Ambiguous (2 items) ----
    {
        "question_id": "q-ambi-01",
        "question": "What is the single best retrieval algorithm for every question-answering system?",
        "category": "ambiguous",
        "answerability": "unanswerable",
        "reference_answer": "The question is ambiguous and underspecified: there is no single universally best retrieval algorithm. The optimal choice depends on trade-offs between latency, hardware, out-of-domain generalization, and index size as analyzed across the corpus.",
        "gold_evidence": []
    },
    {
        "question_id": "q-ambi-02",
        "question": "What score did the model achieve on the benchmark in the paper?",
        "category": "ambiguous",
        "answerability": "unanswerable",
        "reference_answer": "The query is ambiguous because it does not specify which model (e.g. DPR, RAG, ColBERT, RETRO), which paper, which benchmark (e.g. NQ, TriviaQA, MS MARCO), or which metric (e.g. Exact Match, Recall@20, F1).",
        "gold_evidence": []
    }
]

def build_and_split():
    # Load JSON schema to validate every question
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    validator = jsonschema.Draft7Validator(schema)

    # Attach corpus version and author
    for q in QUESTIONS:
        q["corpus_version"] = "v1.0"
        q["authored_by"] = "human:curator"
        q["reviewed_by"] = "human:peer-review"

    # Stratified split: partition each category into 50% dev and 50% test with fixed seed
    random.seed(42)
    categories = {}
    for q in QUESTIONS:
        categories.setdefault(q["category"], []).append(q)

    dev_set = []
    test_set = []

    for cat, items in sorted(categories.items()):
        random.shuffle(items)
        n = len(items)
        split_idx = n // 2
        dev_items = items[:split_idx]
        test_items = items[split_idx:]
        for it in dev_items:
            it["split"] = "dev"
        for it in test_items:
            it["split"] = "test"
        dev_set.extend(dev_items)
        test_set.extend(test_items)

    all_questions = dev_set + test_set
    for q in all_questions:
        errors = list(validator.iter_errors(q))
        if errors:
            raise ValueError(f"Schema validation error on {q['question_id']}: {errors}")

    print(f"Validated all {len(all_questions)} questions against {SCHEMA_PATH.name}!")
    print(f"Split completed: {len(dev_set)} dev questions, {len(test_set)} test questions.")

    # Write questions.dev.jsonl
    with open(DEV_PATH, "w", encoding="utf-8") as f:
        for q in dev_set:
            f.write(json.dumps(q, ensure_ascii=False) + "\n")

    # Write questions.test.jsonl
    with open(TEST_PATH, "w", encoding="utf-8") as f:
        for q in test_set:
            f.write(json.dumps(q, ensure_ascii=False) + "\n")

    # Calculate SHA-256 of dev and test files and commit split.sha256
    dev_sha = hashlib.sha256(DEV_PATH.read_bytes()).hexdigest()
    test_sha = hashlib.sha256(TEST_PATH.read_bytes()).hexdigest()
    
    with open(HASH_PATH, "w", encoding="utf-8") as f:
        f.write(f"dev_sha256={dev_sha}\ntest_sha256={test_sha}\n")

    print(f"Wrote {DEV_PATH.name} (SHA: {dev_sha[:10]}...)")
    print(f"Wrote {TEST_PATH.name} (SHA: {test_sha[:10]}...)")
    print(f"Committed split hashes to {HASH_PATH.name}")

if __name__ == "__main__":
    build_and_split()
