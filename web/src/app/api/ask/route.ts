/**
 * POST /api/ask (TRD §7, §9.1).
 * Core RAG Orchestrator: validates request -> retrieves passages -> generates grounded answer -> validates citations.
 *
 * Preserves three genuinely distinct retrieval modes:
 *   - "lexical": Pure Okapi BM25 retrieval (raw BM25 scores)
 *   - "embedding": Pure dense vector similarity via all-MiniLM-L6-v2 (raw cosine similarity)
 *   - "hybrid": Reciprocal Rank Fusion (RRF) combining lexical and dense candidate sets
 *
 * Also supports:
 *   - `enableMetadataAugmentation` (boolean): Separately identifiable structured metadata lookup
 *     for author/title opening chunks (`retriever_source: "metadata"`), never silently injected into benchmarks.
 *   - `retrievalFallback`: Records and exposes transparent fallback diagnostics when client ONNX
 *     embedding generation fails and lexical fallback is used (Correction #7).
 */

import { NextRequest, NextResponse } from "next/server";
import { evaluateAbstentionGate } from "@/lib/abstention/gate";
import { generateGroundedAnswer } from "@/lib/generation/groq";
import { embeddingRetriever } from "@/lib/retrieval/embedding";
import { lexicalRetriever } from "@/lib/retrieval/lexical";
import { hybridRetriever } from "@/lib/retrieval/hybrid";
import {
  augmentWithMetadataChunks,
  retrieveMetadataAnchorChunks,
} from "@/lib/retrieval/metadata";
import { ChunkConfigId, RetrieverMode, ScoredChunk } from "@/lib/retrieval/types";

export const maxDuration = 30;

export interface RetrievalFallbackDiagnostics {
  triggered: boolean;
  requested_mode: RetrieverMode;
  actual_mode: RetrieverMode;
  reason: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      retriever = "lexical",
      requestedRetriever,
      fallbackReason = null,
      chunkConfig = "ck256",
      queryVector,
      scopeDocId = null,
      corpusVersion = null,
      k = 5,
      enableMetadataAugmentation = true,
    } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing required 'query' string" }, { status: 400 });
    }

    const t0 = Date.now();
    let actualRetriever: RetrieverMode = retriever as RetrieverMode;
    let effectiveFallbackReason: string | null = fallbackReason;
    const effectiveRequestedMode: RetrieverMode =
      (requestedRetriever as RetrieverMode) || (retriever as RetrieverMode);

    // If caller requested embedding or hybrid but queryVector is missing/invalid,
    // record explicit fallback to lexical rather than reporting dense retrieval.
    const hasValidVector =
      Array.isArray(queryVector) && queryVector.length === 384;

    if ((actualRetriever === "embedding" || actualRetriever === "hybrid") && !hasValidVector) {
      effectiveFallbackReason =
        effectiveFallbackReason ||
        `Missing or invalid 384-d queryVector for requested '${actualRetriever}' mode; fell back to BM25 lexical retrieval.`;
      actualRetriever = "lexical";
    }

    const fallbackDiagnostics: RetrievalFallbackDiagnostics = {
      triggered: effectiveRequestedMode !== actualRetriever || !!effectiveFallbackReason,
      requested_mode: effectiveRequestedMode,
      actual_mode: actualRetriever,
      reason: effectiveFallbackReason,
    };

    let retrieved: ScoredChunk[] = [];
    const isComparativeQuery =
      /\b(compare|contrast|differ|difference|differences|versus|vs\.?|both|between)\b/i.test(query);
    const effectiveK = !scopeDocId
      ? Math.min(Math.max(k, isComparativeQuery ? 8 : 6), 8)
      : Math.min(k, 6);

    if (actualRetriever === "lexical") {
      retrieved = await lexicalRetriever.retrieve({
        query,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k: effectiveK,
      });
    } else if (actualRetriever === "embedding") {
      retrieved = await embeddingRetriever.retrieve({
        query,
        queryVector,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k: effectiveK,
      });
    } else if (actualRetriever === "hybrid") {
      retrieved = await hybridRetriever.retrieve({
        query,
        queryVector,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k: effectiveK,
      });
    } else {
      return NextResponse.json({ error: `Unsupported retriever '${actualRetriever}'` }, { status: 400 });
    }

    // Optional, separately identifiable structured metadata lookup (`retriever_source: "metadata"`)
    let metadataAnchorCount = 0;
    if (enableMetadataAugmentation) {
      const metaChunks = await retrieveMetadataAnchorChunks({
        query,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
      });
      metadataAnchorCount = metaChunks.length;
      if (metaChunks.length > 0) {
        retrieved = augmentWithMetadataChunks(retrieved, metaChunks, effectiveK);
      }
    }

    const tRetrieve = Date.now();
    const retrieveMs = tRetrieve - t0;

    const isScoped = !!scopeDocId || corpusVersion === "user-upload";

    // TRD §7.4 Abstention Gate: Reject before LLM call if evidence is clearly insufficient
    // Note: If an explicit metadata anchor matched (e.g. exact author/title lookup), bypass pre-LLM score gate
    const gate =
      metadataAnchorCount > 0
        ? { shouldAbstain: false, abstentionReason: null, topScore: retrieved[0]?.score ?? 1.0, threshold: 0, sufficiency: "sufficient" as const }
        : evaluateAbstentionGate(
            retrieved,
            actualRetriever,
            chunkConfig,
            isScoped
          );

    if (gate.shouldAbstain) {
      return NextResponse.json({
        decision: "abstain",
        answer: isScoped
          ? "The uploaded document contains insufficient evidence to answer this question."
          : "The available research paper corpus contains insufficient evidence to answer this question.",
        claims: [],
        abstention_reason: gate.abstentionReason,
        retrieved,
        gate_triggered: true,
        model: "abstention-gate",
        actual_retriever: actualRetriever,
        requested_retriever: effectiveRequestedMode,
        retrieval_fallback: fallbackDiagnostics,
        metadata_augmentation_used: metadataAnchorCount > 0,
        timings_ms: {
          retrieve: retrieveMs,
          generate: 0,
          total: Date.now() - t0,
        },
      });
    }

    // Grounded generation via Groq
    const result = await generateGroundedAnswer(query, retrieved);
    const totalMs = Date.now() - t0;
    const generateMs = totalMs - retrieveMs;

    return NextResponse.json({
      decision: result.decision,
      answer: result.answer,
      claims: result.claims,
      abstention_reason: result.abstention_reason,
      retrieved,
      model: result.model,
      usage: result.usage,
      actual_retriever: actualRetriever,
      requested_retriever: effectiveRequestedMode,
      retrieval_fallback: fallbackDiagnostics,
      metadata_augmentation_used: metadataAnchorCount > 0,
      diagnostics: result.diagnostics,
      timings_ms: {
        retrieve: retrieveMs,
        generate: generateMs,
        total: totalMs,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/ask:", message);
    return NextResponse.json({ error: "Internal Server Error", detail: message }, { status: 500 });
  }
}
