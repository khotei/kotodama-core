import { Effect, Schema } from 'effect'

/** The requested input was not a buildable word (empty / symbol-only). Maps to HTTP 422. */
export class InvalidWordInputError extends Schema.TaggedErrorClass<InvalidWordInputError>()(
  'InvalidWordInputError',
  { input: Schema.String },
  { httpApiStatus: 422 },
) {}

export type WordInput =
  | { readonly _tag: 'word'; readonly word: string }
  | { readonly _tag: 'invalid' }

const LETTER = /\p{L}/u

/**
 * Multi-word input is kept **verbatim** (a collocation is a real lexical entry) — only whitespace
 * is normalized. Deliberately carries NO length/word-count policy: that ceiling is the verifier's
 * pre-filter, not the normalizer's.
 */
export const normalizeWordInput = (raw: string): WordInput => {
  const word = raw.trim().replace(/\s+/g, ' ')
  if (word.length === 0 || !LETTER.test(word)) return { _tag: 'invalid' }
  return { _tag: 'word', word }
}

/** {@link normalizeWordInput} lifted into the Effect channel — the one author of the invalid-input 422. */
export const parseWordInput = Effect.fnUntraced(function* (raw: string) {
  const input = normalizeWordInput(raw)
  if (input._tag === 'invalid') return yield* Effect.fail(new InvalidWordInputError({ input: raw }))
  return input.word
})
