/**
 * Evaluation route handler: POST /api/eval/ask (TRD §9.3).
 * Protected by X-Eval-Key header.
 * Supports retrieveOnly mode to benchmark retrievers without LLM calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { lexicalRetriever } from "@/lib/retrieval/lexical";
import { ChunkConfigId, ScoredChunk } from "@/lib/retrieval/types";

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
    } else {
      return NextResponse.json(
        { error: `Retriever '${retriever}' is not yet implemented or enabled.` },
        { status: 501 }
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

    // In Phase 3, grounded generation will follow here
    return NextResponse.json({
      retrieved,
      timings_ms: { retrieve: retrieveMs, total: retrieveMs },
      response: {
        decision: "answerable",
        answer: "Grounded generation will be enabled in Phase 3.",
        claims: [],
        citations: [],
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
