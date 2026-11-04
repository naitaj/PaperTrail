/**
 * Grounded generation schemas and response structures (TRD §7, §9).
 */

import { ValidationDiagnostics } from "@/lib/citations/validate";

export interface GroundedClaim {
  claim_text: string;
  citation_chunk_id: string;
  doc_id: string;
  page: number;
  evidence_quote: string;
}

export type AnswerDecision = "answerable" | "partial" | "abstain";

export interface GenerateAnswerResult {
  decision: AnswerDecision;
  answer: string;
  claims: GroundedClaim[];
  abstention_reason?: string | null;
  model: string;
  diagnostics?: ValidationDiagnostics;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

