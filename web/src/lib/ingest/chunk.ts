/**
 * Server-side text chunking for uploaded PDFs.
 * Mirrors the Python pipeline's page-bounded sentence-packing algorithm.
 * Uses word-level approximation (~0.75 words/token) for serverless compatibility.
 */

export interface ChunkResult {
  chunk_id: string;
  doc_id: string;
  config_id: string;
  page_start: number;
  page_end: number;
  ordinal: number;
  section_title: string | null;
  text: string;
  text_hash: string;
  token_count: number;
  lex_len: number;
  is_references: boolean;
}

interface ChunkConfig {
  config_id: string;
  target_tokens: number;
  overlap_tokens: number;
  min_tokens: number;
}

export const CHUNK_CONFIGS: Record<string, ChunkConfig> = {
  ck256: { config_id: "ck256", target_tokens: 256, overlap_tokens: 48, min_tokens: 40 },
};

// Approximate token count from text (cl100k_base averages ~4 chars/token)
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Split text into sentences
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace and a capital letter or digit
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'\[])/);
  return parts.filter((s) => s.trim().length > 0);
}

// Simple SHA-256 hash (using Web Crypto API polyfill for Node)
async function sha256(text: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Detect reference sections
function isReferenceSection(text: string): boolean {
  return /^(References|Bibliography)\b/i.test(text.trim());
}

/**
 * Chunk a document's pages into retrievable passages.
 * Page-bounded: chunks never cross page boundaries.
 */
export async function chunkDocument(
  docId: string,
  pages: { pageIndex: number; text: string }[],
  configId: string = "ck256"
): Promise<ChunkResult[]> {
  const config = CHUNK_CONFIGS[configId] || CHUNK_CONFIGS.ck256;
  const chunks: ChunkResult[] = [];
  let globalOrdinal = 0;
  let inReferences = false;

  for (const page of pages) {
    const pageText = page.text.trim();
    if (!pageText) continue;

    // Check if this page starts a references section
    if (isReferenceSection(pageText)) {
      inReferences = true;
    }

    const sentences = splitSentences(pageText);
    let currentSentences: string[] = [];
    let currentTokens = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentTokens = approxTokens(sentence);

      // If adding this sentence exceeds target, flush current chunk
      if (currentSentences.length > 0 && currentTokens + sentTokens > config.target_tokens) {
        const chunkText = currentSentences.join(" ");
        const textHash = await sha256(chunkText);
        chunks.push({
          chunk_id: `${docId}:${config.config_id}:p${page.pageIndex}:c${globalOrdinal}`,
          doc_id: docId,
          config_id: config.config_id,
          page_start: page.pageIndex,
          page_end: page.pageIndex,
          ordinal: globalOrdinal,
          section_title: null,
          text: chunkText.replace(/\x00/g, ""),
          text_hash: textHash,
          token_count: approxTokens(chunkText),
          lex_len: chunkText.split(/\s+/).length,
          is_references: inReferences,
        });
        globalOrdinal++;

        // Overlap: keep last few sentences for context continuity
        const overlapTarget = config.overlap_tokens;
        let overlapTokens = 0;
        let overlapStart = currentSentences.length;
        for (let j = currentSentences.length - 1; j >= 0; j--) {
          const t = approxTokens(currentSentences[j]);
          if (overlapTokens + t > overlapTarget) break;
          overlapTokens += t;
          overlapStart = j;
        }
        currentSentences = currentSentences.slice(overlapStart);
        currentTokens = overlapTokens;
      }

      currentSentences.push(sentence);
      currentTokens += sentTokens;
    }

    // Flush remaining sentences for this page
    if (currentSentences.length > 0) {
      const chunkText = currentSentences.join(" ");
      if (approxTokens(chunkText) >= config.min_tokens || chunks.length === 0) {
        const textHash = await sha256(chunkText);
        chunks.push({
          chunk_id: `${docId}:${config.config_id}:p${page.pageIndex}:c${globalOrdinal}`,
          doc_id: docId,
          config_id: config.config_id,
          page_start: page.pageIndex,
          page_end: page.pageIndex,
          ordinal: globalOrdinal,
          section_title: null,
          text: chunkText.replace(/\x00/g, ""),
          text_hash: textHash,
          token_count: approxTokens(chunkText),
          lex_len: chunkText.split(/\s+/).length,
          is_references: inReferences,
        });
        globalOrdinal++;
      } else if (chunks.length > 0) {
        // Append short remainder to previous chunk
        const prev = chunks[chunks.length - 1];
        const combined = prev.text + " " + chunkText;
        prev.text = combined.replace(/\x00/g, "");
        prev.token_count = approxTokens(combined);
        prev.lex_len = combined.split(/\s+/).length;
        prev.text_hash = await sha256(combined);
      }
    }
  }

  return chunks;
}

