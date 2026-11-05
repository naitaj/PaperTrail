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
export const TERTIARY_MODEL = "qwen/qwen3.8-27b";

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

  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL, TERTIARY_MODEL];
  let lastError: unknown = null;

  for (const candidateModel of modelsToTry) {
    try {
      usedModel = candidateModel;
      const completion = await groq.chat.completions.create({
        model: candidateModel,
        messages,
        temperature: 0.0,
        max_tokens: candidateModel === TERTIARY_MODEL ? 550 : 1200,
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
      lastError = null;
      break;
    } catch (err: unknown) {
      lastError = err;
      console.warn(`Model ${candidateModel} failed, rotating to next fallback:`, err);
    }
  }

  if (lastError) {
    throw lastError;
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
