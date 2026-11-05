/**
 * Abstention Gate (TRD §7.4, FR-ABS-01..03).
 * Rejects queries before LLM invocation when retrieval evidence is clearly insufficient.
 * Preserves separate native thresholds for BM25 and Cosine Similarity, and evaluates
 * Hybrid retrieval using its underlying native component scores (never mixing scales).
 */

import { ScoredChunk } from "@/lib/retrieval/types";
import { GATE_THRESHOLDS } from "./thresholds";

export type EvidenceSufficiency = "sufficient" | "partial_or_weak" | "insufficient" | "none";

export interface GateEvaluationResult {
  shouldAbstain: boolean;
  abstentionReason: string | null;
  topScore: number;
  threshold: number;
  sufficiency: EvidenceSufficiency;
}

export function evaluateAbstentionGate(
  retrieved: ScoredChunk[],
  retriever: "lexical" | "embedding" | "hybrid",
  chunkConfig: string,
  isScoped: boolean = false
): GateEvaluationResult {
  if (!retrieved || retrieved.length === 0) {
    return {
      shouldAbstain: true,
      abstentionReason: isScoped
        ? "insufficient_evidence: zero matching passages found in the document"
        : "insufficient_evidence: zero matching passages found in the corpus",
      topScore: 0.0,
      threshold: 0.0,
      sufficiency: "none",
    };
  }

  const bm25Base = GATE_THRESHOLDS.bm25[chunkConfig] ?? 11.0;
  const embBase = GATE_THRESHOLDS.embedding[chunkConfig] ?? 0.35;

  const bm25Threshold = isScoped ? 1.0 : bm25Base;
  const embThreshold = isScoped ? 0.01 : embBase;

  if (retriever === "hybrid") {
    const maxBm25 = Math.max(
      0,
      ...retrieved.map((c) => (typeof c.raw_bm25_score === "number" ? c.raw_bm25_score : 0))
    );
    const maxEmb = Math.max(
      0,
      ...retrieved.map((c) => (typeof c.raw_embedding_score === "number" ? c.raw_embedding_score : 0))
    );
    const topRrf = retrieved[0].score;

    const bm25Passes = maxBm25 >= bm25Threshold;
    const embPasses = maxEmb >= embThreshold;

    if (!bm25Passes && !embPasses) {
      return {
        shouldAbstain: true,
        abstentionReason: `insufficient_evidence: hybrid components below threshold (max BM25 ${maxBm25.toFixed(2)} < ${bm25Threshold.toFixed(2)}, max cosine ${maxEmb.toFixed(2)} < ${embThreshold.toFixed(2)})`,
        topScore: topRrf,
        threshold: embThreshold,
        sufficiency: "insufficient",
      };
    }

    const bothPass = bm25Passes && embPasses;
    return {
      shouldAbstain: false,
      abstentionReason: null,
      topScore: topRrf,
      threshold: embThreshold,
      sufficiency: bothPass ? "sufficient" : "partial_or_weak",
    };
  }

  const topScore = retrieved[0].score;
  const threshold = retriever === "lexical" ? bm25Threshold : embThreshold;

  if (topScore < threshold) {
    return {
      shouldAbstain: true,
      abstentionReason: `insufficient_evidence: top retrieval score (${topScore.toFixed(2)}) is below confidence threshold (${threshold.toFixed(2)})`,
      topScore,
      threshold,
      sufficiency: "insufficient",
    };
  }

  const passingCount = retrieved.filter((c) => c.score >= threshold).length;
  const sufficiency: EvidenceSufficiency =
    passingCount >= 2 || topScore >= threshold * 1.25 ? "sufficient" : "partial_or_weak";

  return {
    shouldAbstain: false,
    abstentionReason: null,
    topScore,
    threshold,
    sufficiency,
  };
}
