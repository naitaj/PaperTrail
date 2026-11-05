/**
 * Evaluation route handler: POST /api/eval/ask (TRD §9.3).
 * Protected by X-Eval-Key header.
 * Supports retrieveOnly mode to benchmark retrievers (lexical, embedding, hybrid)
 * without LLM calls, and full grounded generation via Groq.
 * Enforces corpusVersion = "v1.0" by default to isolate benchmarks from user uploads.
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

export async function POST(req: NextRequest) {
  const evalKeyHeader = req.headers.get("X-Eval-Key");
  const expectedKey = process.env.EVAL_API_KEY;

  if (expectedKey && evalKeyHeader !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing X-Eval-Key header" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const {
      query,
      retriever = "lexical",
      chunkConfig = "ck256",
      queryVector,
      scopeDocId = null,
      corpusVersion = "v1.0",
      k = 5,
      retrieveOnly = false,
      enableMetadataAugmentation = false,
    } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Bad Request: 'query' string is required" },
        { status: 400 }
      );
    }

    const startRetrieve = Date.now();
    let retrieved: ScoredChunk[] = [];

    if (retriever === "lexical") {
      retrieved = await lexicalRetriever.retrieve({
        query,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k,
      });
    } else if (retriever === "embedding") {
      if (!queryVector || !Array.isArray(queryVector) || queryVector.length !== 384) {
        return NextResponse.json(
          { error: "Embedding retrieval requires 384-dimensional 'queryVector'" },
          { status: 400 }
        );
      }
      retrieved = await embeddingRetriever.retrieve({
        query,
        queryVector,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k,
      });
    } else if (retriever === "hybrid") {
      if (!queryVector || !Array.isArray(queryVector) || queryVector.length !== 384) {
        return NextResponse.json(
          { error: "Hybrid retrieval requires 384-dimensional 'queryVector'" },
          { status: 400 }
        );
      }
      retrieved = await hybridRetriever.retrieve({
        query,
        queryVector,
        configId: chunkConfig as ChunkConfigId,
        scopeDocId,
        corpusVersion,
        k,
      });
    } else {
      return NextResponse.json(
        { error: `Retriever '${retriever}' is not supported.` },
        { status: 400 }
      );
    }

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
        retrieved = augmentWithMetadataChunks(retrieved, metaChunks, k);
      }
    }

    const retrieveMs = Date.now() - startRetrieve;

    if (retrieveOnly) {
      return NextResponse.json({
        retrieved,
        metadata_augmentation_used: metadataAnchorCount > 0,
        timings_ms: {
          retrieve: retrieveMs,
          total: retrieveMs,
        },
      });
    }

    const isScoped = !!scopeDocId || corpusVersion === "user-upload";

    // TRD §7.4 Abstention Gate
    const gate =
      metadataAnchorCount > 0
        ? { shouldAbstain: false, abstentionReason: null, topScore: retrieved[0]?.score ?? 1.0, threshold: 0, sufficiency: "sufficient" as const }
        : evaluateAbstentionGate(
            retrieved,
            retriever as RetrieverMode,
            chunkConfig,
            isScoped
          );
    if (gate.shouldAbstain) {
      return NextResponse.json({
        retrieved,
        metadata_augmentation_used: metadataAnchorCount > 0,
        response: {
          decision: "abstain",
          answer: "The available research paper corpus contains insufficient evidence to answer this question.",
          claims: [],
          abstention_reason: gate.abstentionReason,
        },
        model: "abstention-gate",
        gate_triggered: true,
        timings_ms: {
          retrieve: retrieveMs,
          generate: 0,
          total: retrieveMs,
        },
      });
    }

    const startGen = Date.now();
    const result = await generateGroundedAnswer(query, retrieved);
    const generateMs = Date.now() - startGen;

    return NextResponse.json({
      retrieved,
      metadata_augmentation_used: metadataAnchorCount > 0,
      response: {
        decision: result.decision,
        answer: result.answer,
        claims: result.claims,
        abstention_reason: result.abstention_reason,
      },
      diagnostics: result.diagnostics,
      model: result.model,
      usage: result.usage,
      timings_ms: {
        retrieve: retrieveMs,
        generate: generateMs,
        total: retrieveMs + generateMs,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/eval/ask:", message);
    return NextResponse.json(
      { error: "Internal Server Error", detail: message },
      { status: 500 }
    );
  }
}
