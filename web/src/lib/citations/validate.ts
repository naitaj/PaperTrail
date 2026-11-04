/**
 * Citation Validation Engine (TRD §7.5, FR-CIT-01..05).
 * Validates that every claim cites a chunk present in the retrieved context,
 * and that the evidence quote is a verbatim or high-overlap substring of the cited chunk.
 * Downgrades status to "partial" or "abstain" when citations fail verification.
 */

import { ScoredChunk } from "@/lib/retrieval/types";
import { GroundedClaim } from "@/lib/generation/types";
import { normaliseText, windowOverlapRatio } from "./normalise";

export type ClaimRemovalReason = "REMOVED_NO_VALID_CITATION" | "REMOVED_QUOTE_NOT_FOUND";

export interface RawClaimInput {
  claim_text?: string;
  citation_chunk_id?: string;
  evidence_quote?: string;
}

export interface RemovedClaim {
  claim: RawClaimInput;
  reason: ClaimRemovalReason;
  detail: string;
}

export interface ValidationDiagnostics {
  total_raw_claims: number;
  kept_claims_count: number;
  removed_no_valid_citation: number;
  removed_quote_not_found: number;
  decision_downgraded: boolean;
  original_decision: string;
  final_decision: "answerable" | "partial" | "abstain";
}

export interface CitationValidationResult {
  kept_claims: GroundedClaim[];
  removed_claims: RemovedClaim[];
  decision: "answerable" | "partial" | "abstain";
  diagnostics: ValidationDiagnostics;
}

export function validateCitations(
  rawClaims: RawClaimInput[],
  contextChunks: ScoredChunk[],
  originalDecision: string = "answerable",
  strictMode: boolean = true
): CitationValidationResult {
  const chunkMap = new Map<string, ScoredChunk>(
    contextChunks.map((c) => [c.chunk_id, c])
  );

  const keptClaims: GroundedClaim[] = [];
  const removedClaims: RemovedClaim[] = [];

  let removedNoCitation = 0;
  let removedQuoteNotFound = 0;

  for (const claim of rawClaims) {
    const claimText = (claim.claim_text || "").trim();
    const chunkId = (claim.citation_chunk_id || "").trim();
    const rawQuote = (claim.evidence_quote || "").trim();

    if (!claimText) {
      continue;
    }

    // Rule 1: Chunk ID must exist in the context provided to the model
    if (!chunkId || !chunkMap.has(chunkId)) {
      removedClaims.push({
        claim,
        reason: "REMOVED_NO_VALID_CITATION",
        detail: `Chunk ID '${chunkId}' was not in the retrieved context set.`,
      });
      removedNoCitation++;
      continue;
    }

    const chunk = chunkMap.get(chunkId)!;

    // Rule 2: Verbatim quote validation
    const normChunkText = normaliseText(chunk.text);
    const normQuote = normaliseText(rawQuote);

    const isExactMatch = normQuote.length > 0 && normChunkText.includes(normQuote);
    const overlapRatio = normQuote.length > 0 ? windowOverlapRatio(chunk.text, rawQuote) : 0.0;
    const isOverlapMatch = overlapRatio >= 0.85;

    let quoteVerified = false;
    let finalQuote = rawQuote;

    if (isExactMatch) {
      quoteVerified = true;
    } else if (isOverlapMatch) {
      quoteVerified = true;
      finalQuote = rawQuote + " [Note: High-overlap match]";
    } else if (!strictMode && normQuote.length > 0) {
      // In permissive mode, fallback to initial snippet
      quoteVerified = true;
      finalQuote = chunk.text.slice(0, 120) + "...";
    }

    if (!quoteVerified) {
      removedClaims.push({
        claim,
        reason: "REMOVED_QUOTE_NOT_FOUND",
        detail: `Evidence quote "${rawQuote.slice(0, 60)}..." could not be verified in chunk ${chunkId}.`,
      });
      removedQuoteNotFound++;
      continue;
    }

    keptClaims.push({
      claim_text: claimText,
      citation_chunk_id: chunk.chunk_id,
      doc_id: chunk.doc_id,
      page: chunk.page_start,
      evidence_quote: finalQuote,
    });
  }

  // TRD §7.5 Status Downgrading Logic:
  // if kept is empty: result.status = abstained (insufficient_evidence)
  // elif removed fraction > 0: result.status = partial (unless already partial/abstain)
  let finalDecision: "answerable" | "partial" | "abstain";
  let downgraded = false;

  if (keptClaims.length === 0) {
    finalDecision = "abstain";
    if (originalDecision !== "abstain") {
      downgraded = true;
    }
  } else if (removedClaims.length > 0) {
    if (originalDecision === "answerable") {
      finalDecision = "partial";
      downgraded = true;
    } else {
      finalDecision = (originalDecision === "abstain" ? "abstain" : "partial");
    }
  } else {
    finalDecision = originalDecision === "partial" ? "partial" : "answerable";
  }

  return {
    kept_claims: keptClaims,
    removed_claims: removedClaims,
    decision: finalDecision,
    diagnostics: {
      total_raw_claims: rawClaims.length,
      kept_claims_count: keptClaims.length,
      removed_no_valid_citation: removedNoCitation,
      removed_quote_not_found: removedQuoteNotFound,
      decision_downgraded: downgraded,
      original_decision: originalDecision,
      final_decision: finalDecision,
    },
  };
}

