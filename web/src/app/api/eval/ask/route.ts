/**
 * Evaluation route handler: POST /api/eval/ask (TRD §9.3).
 * Protected by X-Eval-Key header.
 * Supports retrieveOnly mode to benchmark retrievers without LLM calls,
 * and full grounded generation via Groq.
 */

import { NextRequest, NextResponse } from "next/server";
import { evaluateAbstentionGate } from "@/lib/abstention/gate";
import { generateGroundedAnswer } from "@/lib/generation/groq";
import { embeddingRetriever } from "@/lib/retrieval/embedding";
import { lexicalRetriever } from "@/lib/retrieval/lexical";
import { ChunkConfigId, ScoredChunk } from "@/lib/retrieval/types";

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
      k = 5,
      retrieveOnly = false,
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
        k,
      });
    } else {
      return NextResponse.json(
        { error: `Retriever '${retriever}' is not supported.` },
        { status: 400 }
      );
    }

    const retrieveMs = Date.now() - startRetrieve;

    if (retrieveOnly) {
      return NextResponse.json({
        retrieved,
        timings_ms: {
          retrieve: retrieveMs,
          total: retrieveMs,
        },
      });
    }

    // TRD §7.4 Abstention Gate
    const gate = evaluateAbstentionGate(retrieved, retriever, chunkConfig);
    if (gate.shouldAbstain) {
      return NextResponse.json({
        retrieved,
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
      response: {
        decision: result.decision,
        answer: result.answer,
        claims: result.claims,
        abstention_reason: result.abstention_reason,
      },
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
