/**
 * Citation Validation Engine (TRD §7.5, FR-CIT-01..05).
 * Validates that every claim cites a chunk present in the retrieved context,
 * that the evidence quote is a verbatim or high-overlap contiguous span of the
 * cited chunk (or its title/author/year header on page 1), and that the claim
 * itself is lexically supported by the cited passage.
 * Downgrades status to "partial" or "abstain" when citations fail verification.
 */

import { ScoredChunk } from "@/lib/retrieval/types";
import { GroundedClaim } from "@/lib/generation/types";
import { claimSupportRatio, normaliseText, tokenizeAlnum, windowOverlapRatio } from "./normalise";

export type ClaimRemovalReason =
  | "REMOVED_NO_VALID_CITATION"
  | "REMOVED_QUOTE_NOT_FOUND"
  | "REMOVED_CLAIM_LOW_LEXICAL_OVERLAP_HEURISTIC";

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
  citation_existence_passed: number;
  quote_exact_match_count: number;
  quote_contiguous_overlap_count: number;
  heuristic_lexical_overlap_passed: number;
  removed_no_valid_citation: number;
  removed_quote_not_found: number;
  removed_claim_low_lexical_overlap_heuristic: number;
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

/**
 * Build the searchable passage surface for a chunk, including the document
 * metadata header shown to the LLM in prompt.ts (`[Title: ... | Authors: ... | Year: ... | Page ...]`).
 */
function buildSearchableChunkText(chunk: ScoredChunk): string {
  const parts: string[] = [];
  if (chunk.doc_title || (chunk.doc_authors && chunk.doc_authors.length > 0) || chunk.doc_year) {
    const authorLine =
      chunk.doc_authors && chunk.doc_authors.length > 0
        ? ` | Authors: ${chunk.doc_authors.join(", ")}`
        : "";
    const yearLine = chunk.doc_year ? ` | Year: ${chunk.doc_year}` : "";
    parts.push(
      `[Title: ${chunk.doc_title || chunk.doc_id}${authorLine}${yearLine} | Page ${chunk.page_start}]`
    );
  }
  parts.push(chunk.text || "");
  return parts.join("\n");
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

  let citationExistencePassed = 0;
  let quoteExactCount = 0;
  let quoteContiguousCount = 0;
  let heuristicOverlapPassed = 0;
  let removedNoCitation = 0;
  let removedQuoteNotFound = 0;
  let removedLowHeuristicOverlap = 0;

  for (const claim of rawClaims) {
    const claimText = (claim.claim_text || "").trim();
    const chunkId = (claim.citation_chunk_id || "").trim();
    const rawQuote = (claim.evidence_quote || "").trim();

    if (!claimText) {
      continue;
    }

    // Dimension 1: Citation Existence (chunk_id must exist in retrieved context set)
    if (!chunkId || !chunkMap.has(chunkId)) {
      removedClaims.push({
        claim,
        reason: "REMOVED_NO_VALID_CITATION",
        detail: `Chunk ID '${chunkId}' was not in the retrieved context set.`,
      });
      removedNoCitation++;
      continue;
    }
    citationExistencePassed++;

    const chunk = chunkMap.get(chunkId)!;
    const searchableText = buildSearchableChunkText(chunk);

    // Dimension 2: Quote Correctness (verbatim substring or contiguous-window overlap)
    const normChunkText = normaliseText(searchableText);
    const normQuote = normaliseText(rawQuote);
    const quoteTokens = tokenizeAlnum(rawQuote);

    const isNonTrivialQuote = quoteTokens.length >= 2 || normQuote.length >= 8;
    const isExactMatch = isNonTrivialQuote && normChunkText.includes(normQuote);
    const overlapRatio = isNonTrivialQuote
      ? windowOverlapRatio(searchableText, rawQuote)
      : 0.0;
    const isOverlapMatch = overlapRatio >= 0.85;

    let quoteVerified = false;
    let finalQuote = rawQuote;

    if (isExactMatch) {
      quoteVerified = true;
      quoteExactCount++;
    } else if (isOverlapMatch) {
      quoteVerified = true;
      quoteContiguousCount++;
      finalQuote = rawQuote + " [Note: High-overlap match]";
    } else if (!strictMode && isNonTrivialQuote) {
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

    // Dimension 3: Runtime Lexical Overlap Heuristic (heuristic filter, NOT proof of entailment)
    const heuristicScore = claimSupportRatio(claimText, `${rawQuote} ${searchableText}`);
    if (strictMode && heuristicScore < 0.25) {
      removedClaims.push({
        claim,
        reason: "REMOVED_CLAIM_LOW_LEXICAL_OVERLAP_HEURISTIC",
        detail: `Claim "${claimText.slice(0, 60)}..." failed lexical overlap heuristic (${heuristicScore.toFixed(2)}) against chunk ${chunkId}.`,
      });
      removedLowHeuristicOverlap++;
      continue;
    }
    heuristicOverlapPassed++;

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
      finalDecision = originalDecision === "abstain" ? "abstain" : "partial";
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
      citation_existence_passed: citationExistencePassed,
      quote_exact_match_count: quoteExactCount,
      quote_contiguous_overlap_count: quoteContiguousCount,
      heuristic_lexical_overlap_passed: heuristicOverlapPassed,
      removed_no_valid_citation: removedNoCitation,
      removed_quote_not_found: removedQuoteNotFound,
      removed_claim_low_lexical_overlap_heuristic: removedLowHeuristicOverlap,
      decision_downgraded: downgraded,
      original_decision: originalDecision,
      final_decision: finalDecision,
    },
  };
}
