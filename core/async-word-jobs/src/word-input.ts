/**
 * Word-input normalization — the one rule for turning a raw build query into a buildable word, used
 * by {@link WordBuildRequester} at the build entry. Pure (no Effect, no I/O): a multi-word phrase
 * yields its first word (flagged), and empty / symbol-only input is rejected so it never starts a
 * build. Single words only at MVP (UF-002 §edge-cases). Colocated with its only consumer (the
 * requester); a non-buildable input makes `request` fail `InvalidWordInputError`.
 */
export type WordInput =
  | { readonly _tag: 'word'; readonly word: string; readonly trimmedToFirstWord: boolean }
  | { readonly _tag: 'invalid' }

const LETTER = /\p{L}/u

/**
 * Normalize a raw query. Returns the first whitespace-delimited token as `word` (with
 * `trimmedToFirstWord` set when the input held more than one token), or `invalid` when the input is
 * empty, whitespace-only, or its first token contains no letter (symbol-only). Intra-word characters
 * (e.g. hyphens) are preserved — the token is taken verbatim, only outer whitespace is stripped.
 */
export const normalizeWordInput = (raw: string): WordInput => {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
  const first = tokens[0]
  if (first === undefined || !LETTER.test(first)) return { _tag: 'invalid' }
  return { _tag: 'word', word: first, trimmedToFirstWord: tokens.length > 1 }
}
