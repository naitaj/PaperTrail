/**
 * Grounded generation engine using Groq API (TRD §7, FR-GEN-01..04).
 * Uses llama-3.3-70b-versatile with structured JSON format and verbatim quote verification.
 */

import Groq from "groq-sdk";
import { validateCitations } from "@/lib/citations/validate";
import { ScoredChunk } from "@/lib/retrieval/types";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { GenerateAnswerResult } from "./types";

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (groqClient) {
    return groqClient;
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in environment variables");
  }
  groqClient = new Groq({ apiKey });
  return groqClient;
}

export const PRIMARY_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_MODEL = "openai/gpt-oss-20b";

export async function generateGroundedAnswer(
  question: string,
  passages: ScoredChunk[]
): Promise<GenerateAnswerResult> {
  const groq = getGroqClient();
  const userContent = buildUserMessage(question, passages);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let rawJson = "";
  let usedModel = PRIMARY_MODEL;
  let usageInfo: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  try {
    const completion = await groq.chat.completions.create({
      model: PRIMARY_MODEL,
      messages,
      temperature: 0.0,
      response_format: { type: "json_object" },
    });
    rawJson = completion.choices[0]?.message?.content || "{}";
    if (completion.usage) {
      usageInfo = {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        total_tokens: completion.usage.total_tokens,
      };
    }
  } catch (err: unknown) {
    console.warn(`Primary model ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, err);
    usedModel = FALLBACK_MODEL;
    const fallbackCompletion = await groq.chat.completions.create({
      model: FALLBACK_MODEL,
      messages,
      temperature: 0.0,
      response_format: { type: "json_object" },
    });
    rawJson = fallbackCompletion.choices[0]?.message?.content || "{}";
    if (fallbackCompletion.usage) {
      usageInfo = {
        prompt_tokens: fallbackCompletion.usage.prompt_tokens,
        completion_tokens: fallbackCompletion.usage.completion_tokens,
        total_tokens: fallbackCompletion.usage.total_tokens,
      };
    }
  }

  interface ParsedClaim {
    claim_text?: string;
    citation_chunk_id?: string;
    evidence_quote?: string;
  }

  interface ParsedResponse {
    decision?: string;
    answer?: string;
    claims?: ParsedClaim[];
    abstention_reason?: string | null;
  }

  let parsed: ParsedResponse;
  try {
    parsed = JSON.parse(rawJson) as ParsedResponse;
  } catch {
    return {
      decision: "abstain",
      answer: "Failed to parse structured model response.",
      claims: [],
      abstention_reason: "Model response was not valid JSON",
      model: usedModel,
    };
  }

  const rawClaims: ParsedClaim[] = Array.isArray(parsed.claims) ? parsed.claims : [];
  const rawDecision = parsed.decision || "answerable";

  // Validate citations and quotes according to TRD §7.5
  const validation = validateCitations(rawClaims, passages, rawDecision, true);

  return {
    decision: validation.decision,
    answer: String(parsed.answer || ""),
    claims: validation.kept_claims,
    abstention_reason:
      validation.decision === "abstain"
        ? parsed.abstention_reason || "Insufficient verified evidence in retrieved context."
        : parsed.abstention_reason || null,
    model: usedModel,
    diagnostics: validation.diagnostics,
    usage: usageInfo,
  };
}
