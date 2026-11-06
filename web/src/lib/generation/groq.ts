/**
 * Grounded generation engine using Groq API (TRD §7, FR-GEN-01..04).
 * Implements multi-model quota pool rotation + rate-limit cooldown tracking +
 * in-memory response caching for identical deterministic (question + chunks) pairs.
 */

import crypto from "crypto";
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
  groqClient = new Groq({ apiKey, maxRetries: 0 });
  return groqClient;
}

export const PRIMARY_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_MODEL = "openai/gpt-oss-20b";
export const TERTIARY_MODEL = "qwen/qwen3.8-27b";

/**
 * Pool of active Groq chat models available on this API key.
 * Each model has its own independent free-tier TPM/TPD bucket.
 * Ordered by grounded JSON synthesis quality.
 *
 * To discover available models: GET https://api.groq.com/openai/v1/models
 */
export const MODEL_POOL: string[] = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "allam-2-7b",
];

// In-memory map of model -> timestamp (ms) until which the model is on rate-limit cooldown
const modelCooldownUntil = new Map<string, number>();

// In-memory cache of deterministic (question + passage chunk IDs) -> GenerateAnswerResult
const responseCache = new Map<string, GenerateAnswerResult>();
const MAX_CACHE_ENTRIES = 200;

function computeCacheKey(question: string, passages: ScoredChunk[]): string {
  const normalizedQ = question.trim().toLowerCase().replace(/\s+/g, " ");
  const chunkSignature = passages.map((p) => `${p.chunk_id}:${p.text.length}`).join("|");
  return crypto.createHash("sha256").update(`${normalizedQ}::${chunkSignature}`).digest("hex");
}

function getOrderedCandidateModels(): string[] {
  const now = Date.now();
  const available: string[] = [];
  const coolingDown: { model: string; until: number }[] = [];

  for (const model of MODEL_POOL) {
    const until = modelCooldownUntil.get(model) || 0;
    if (until <= now) {
      if (until > 0) modelCooldownUntil.delete(model);
      available.push(model);
    } else {
      coolingDown.push({ model, until });
    }
  }

  // Sort cooling-down models by soonest expiry as last-resort fallbacks
  coolingDown.sort((a, b) => a.until - b.until);
  return [...available, ...coolingDown.map((c) => c.model)];
}

function markModelRateLimited(model: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const now = Date.now();

  if (lower.includes("tokens per day") || lower.includes("tpd") || lower.includes("requests per day")) {
    // Daily quota exhausted on this model -> cool down for 30 minutes
    modelCooldownUntil.set(model, now + 30 * 60 * 1000);
  } else if (lower.includes("429") || lower.includes("rate_limit") || lower.includes("rate limit")) {
    // Per-minute TPM/RPM limit -> cool down for 65 seconds
    modelCooldownUntil.set(model, now + 65 * 1000);
  } else if (lower.includes("model_not_found") || lower.includes("decommissioned") || lower.includes("404")) {
    // Model unavailable -> cool down for 1 hour
    modelCooldownUntil.set(model, now + 60 * 60 * 1000);
  }
}

function cleanJsonContent(raw: string): string {
  let cleaned = raw.trim();
  // Strip <think>...</think> blocks if emitted by reasoning models like qwen3-32b
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return cleaned || "{}";
}

export async function generateGroundedAnswer(
  question: string,
  passages: ScoredChunk[]
): Promise<GenerateAnswerResult> {
  const cacheKey = computeCacheKey(question, passages);
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const groq = getGroqClient();
  const userContent = buildUserMessage(question, passages);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let rawJson = "";
  let usedModel = PRIMARY_MODEL;
  let usageInfo: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

  const modelsToTry = getOrderedCandidateModels();
  let lastError: unknown = null;

  for (const candidateModel of modelsToTry) {
    try {
      usedModel = candidateModel;
      const completion = await groq.chat.completions.create({
        model: candidateModel,
        messages,
        temperature: 0.0,
        max_tokens: 750,
        response_format: { type: "json_object" },
      });
      rawJson = cleanJsonContent(completion.choices[0]?.message?.content || "{}");
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
      markModelRateLimited(candidateModel, err);
      console.warn(`Model ${candidateModel} failed, rotating to next model in pool:`, err);
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

  const finalResult: GenerateAnswerResult = {
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

  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, finalResult);

  return finalResult;
}
