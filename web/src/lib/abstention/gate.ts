/**
 * Abstention Gate (TRD §7.4, FR-ABS-01..03).
 * Rejects queries before LLM invocation when retrieval evidence is clearly insufficient.
 * Saves LLM tokens and prevents hallucinations on out-of-corpus queries.
 */

import { ScoredChunk } from "@/lib/retrieval/types";
import { GATE_THRESHOLDS } from "./thresholds";

export interface GateEvaluationResult {
  shouldAbstain: boolean;
  abstentionReason: string | null;
  topScore: number;
  threshold: number;
}

export function evaluateAbstentionGate(
  retrieved: ScoredChunk[],
  retriever: "lexical" | "embedding",
  chunkConfig: string
): GateEvaluationResult {
  if (!retrieved || retrieved.length === 0) {
    return {
      shouldAbstain: true,
      abstentionReason: "insufficient_evidence: zero matching passages found in the corpus",
      topScore: 0.0,
      threshold: 0.0,
    };
  }

  const topScore = retrieved[0].score;
  const thresholdMap = retriever === "lexical" ? GATE_THRESHOLDS.bm25 : GATE_THRESHOLDS.embedding;
  const threshold = thresholdMap[chunkConfig] ?? (retriever === "lexical" ? 11.0 : 0.35);

  if (topScore < threshold) {
    return {
      shouldAbstain: true,
      abstentionReason: `insufficient_evidence: top retrieval score (${topScore.toFixed(2)}) is below confidence threshold (${threshold.toFixed(2)})`,
      topScore,
      threshold,
    };
  }

  return {
    shouldAbstain: false,
    abstentionReason: null,
    topScore,
    threshold,
  };
}

