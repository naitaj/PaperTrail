/**
 * Normalisation and verification utilities for citation quote matching (TRD §7.5).
 * - lower-case
 * - collapse whitespace (spaces, newlines, tabs)
 * - undo line-end hyphenation (e.g., "bio-\nlogical" -> "biological")
 * - strip surrounding quotes and punctuation for token span checks
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when",
  "at", "by", "for", "with", "about", "against", "between", "into",
  "through", "during", "before", "after", "above", "below", "to", "from",
  "up", "down", "in", "out", "on", "off", "over", "under", "again",
  "further", "once", "here", "there", "where", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
  "will", "just", "should", "now", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "of", "as", "that",
  "this", "these", "those", "it", "its", "they", "them", "their", "which",
  "who", "whom", "whose", "what", "also", "may", "might", "could", "would",
]);

export function normaliseText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    // Undo line-end hyphenation: word-\nword -> wordword
    .replace(/(\w+)-\s*\n\s*(\w+)/g, "$1$2")
    // Collapse any whitespace sequence to a single space
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeAlnum(text: string): string[] {
  const norm = normaliseText(text);
  if (!norm) return [];
  return norm
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Contiguous window/sequence overlap ratio between haystack and needle.
 * Unlike bag-of-words set intersection, this requires the needle tokens to
 * appear in a contiguous local window of the haystack and preserves local
 * ordering (adjacent bigrams when >= 3 tokens) so shuffled words from
 * scattered parts of a chunk do not falsely validate.
 */
export function windowOverlapRatio(haystack: string, needle: string): number {
  const normHaystack = normaliseText(haystack);
  const normNeedle = normaliseText(needle);

  if (!normNeedle) return 0.0;
  if (normHaystack.includes(normNeedle)) return 1.0;

  const hTokens = tokenizeAlnum(haystack);
  const nTokens = tokenizeAlnum(needle);
  if (nTokens.length === 0 || hTokens.length === 0) return 0.0;

  // Check exact contiguous token subsequence after punctuation stripping
  const hJoined = " " + hTokens.join(" ") + " ";
  const nJoined = " " + nTokens.join(" ") + " ";
  if (hJoined.includes(nJoined)) return 1.0;

  if (nTokens.length === 1) {
    return hTokens.includes(nTokens[0]) ? 1.0 : 0.0;
  }

  // Sliding window of size W = min(hTokens.length, nTokens.length + 3)
  // within which we measure ordered subsequence / bigram match
  const windowLen = Math.min(hTokens.length, nTokens.length + 3);
  let bestScore = 0.0;

  for (let start = 0; start <= hTokens.length - windowLen; start++) {
    const win = hTokens.slice(start, start + windowLen);
    // Longest / greedy ordered match inside this local window
    let hIdx = 0;
    let orderedMatched = 0;
    for (const nt of nTokens) {
      const foundOffset = win.slice(hIdx).indexOf(nt);
      if (foundOffset !== -1) {
        orderedMatched++;
        hIdx += foundOffset + 1;
      }
    }
    const ratio = orderedMatched / nTokens.length;
    if (ratio > bestScore) {
      bestScore = ratio;
    }
    if (bestScore === 1.0) break;
  }

  return bestScore;
}

/**
 * Claim-to-evidence lexical entailment / support ratio.
 * Verifies that the substantive content tokens (and any numbers) in claim_text
 * have grounding in the cited evidence quote + chunk text.
 */
export function claimSupportRatio(claimText: string, evidenceSourceText: string): number {
  const claimTokens = tokenizeAlnum(claimText).filter(
    (t) => t.length >= 2 && !STOPWORDS.has(t)
  );
  if (claimTokens.length === 0) return 1.0;

  const sourceTokens = new Set(tokenizeAlnum(evidenceSourceText));
  if (sourceTokens.size === 0) return 0.0;

  let supported = 0;
  for (const ct of claimTokens) {
    if (sourceTokens.has(ct)) {
      supported++;
      continue;
    }
    // Prefix stem match (>= 4 chars) for morphological variants (e.g. "evaluate" vs "evaluation")
    if (ct.length >= 5) {
      const stem = ct.slice(0, Math.min(ct.length - 1, 6));
      let stemMatched = false;
      for (const st of sourceTokens) {
        if (st.length >= 4 && (st.startsWith(stem) || ct.startsWith(st.slice(0, 5)))) {
          stemMatched = true;
          break;
        }
      }
      if (stemMatched) {
        supported++;
      }
    }
  }

  return supported / claimTokens.length;
}
