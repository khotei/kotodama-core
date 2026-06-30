import { Effect, Schema } from 'effect'

/** The requested input was not a buildable word (empty / symbol-only). Maps to HTTP 422. */
export class InvalidWordInputError extends Schema.TaggedErrorClass<InvalidWordInputError>()(
  'InvalidWordInputError',
  { input: Schema.String },
  { httpApiStatus: 422 },
) {}

/**
 * Word-input normalization — the one rule for turning a raw query into the word it targets. Pure
 * word-identity logic (no Effect, no I/O), so it lives with the word reads/creation in `core/words`
 * and is FE-shareable; it knows nothing of builds. A multi-word phrase yields its first word (flagged),
 * and empty / symbol-only input is `invalid`. Single words only at MVP (UF-002 §edge-cases). Its
 * (currently sole) consumer is `requestWordBuild` at the build entry, where a non-buildable input makes
 * the flow fail {@link InvalidWordInputError}.
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

/**
 * {@link normalizeWordInput} lifted into the Effect channel — the build entry's "give me a word or
 * fail" step: succeeds with the buildable word, or fails {@link InvalidWordInputError} (422) for empty
 * / symbol-only input. Lets `requestWordBuild` collapse the tagged-union check to one `yield*`.
 */
export const parseWordInput = Effect.fnUntraced(function* (raw: string) {
  const input = normalizeWordInput(raw)
  if (input._tag === 'invalid') return yield* Effect.fail(new InvalidWordInputError({ input: raw }))
  return input.word
})
