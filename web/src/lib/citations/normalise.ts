/**
 * Normalisation utilities for citation quote matching (TRD §7.5).
 * - lower-case
 * - collapse whitespace (spaces, newlines, tabs)
 * - undo line-end hyphenation (e.g., "bio-\nlogical" -> "biological")
 * - strip surrounding quotes and punctuation
 */

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

/**
 * Token window overlap ratio between text and quote (fallback when punctuation varies).
 */
export function windowOverlapRatio(haystack: string, needle: string): number {
  const normHaystack = normaliseText(haystack);
  const normNeedle = normaliseText(needle);

  if (!normNeedle) return 0.0;
  if (normHaystack.includes(normNeedle)) return 1.0;

  const needleTokens = normNeedle.split(" ").filter(Boolean);
  if (needleTokens.length === 0) return 0.0;

  const haystackTokens = new Set(normHaystack.split(" ").filter(Boolean));
  let matched = 0;
  for (const token of needleTokens) {
    if (haystackTokens.has(token)) {
      matched++;
    }
  }

  return matched / needleTokens.length;
}

