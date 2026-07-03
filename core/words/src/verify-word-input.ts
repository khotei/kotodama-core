import { AiService } from '@kotodama/ai'
import { VERIFIER_MODEL } from '@kotodama/core-content'
import { Effect, Schema } from 'effect'
import { InvalidWordInputError, parseWordInput } from './word-input'

// `reason` is for logging only; the normalizer already settles the stored form, so no spelling.
export const WordVerdict = Schema.Struct({
  isValid: Schema.Boolean,
  reason: Schema.String,
})
export type WordVerdict = typeof WordVerdict.Type

const MAX_CHARS = 64
const MAX_WORDS = 4

// Kept terse on purpose: a yes/no gate at `reasoningEffort: 'minimal'` performs best on a short,
// unambiguous instruction.
const verdictPrompt = (word: string): string =>
  `Is "${word}" a real word or a short, established lexical collocation (idiom, set phrase, compound term) that a dictionary would have an entry for? Answer isValid=false for gibberish, random characters, or pasted sentences/text. Answer isValid=true only for a genuine dictionary-worthy headword or phrase.`

/**
 * The create-path gibberish gate, three stages cheaper-first: normalize (`parseWordInput` — the
 * one author of the invalid-input 422) → deterministic pre-filter (fail-closed, no network — the
 * floor) → OpenAI mini judge. The judge is a non-critical quality layer, so a judge fault **fails
 * open** (admits the pre-filtered word) — a gate must not block creation on its own failure.
 */
export const verifyWordInput = Effect.fnUntraced(function* (raw: string) {
  const word = yield* parseWordInput(raw)

  // `word` is already whitespace-normalized upstream, so a plain space split counts tokens.
  const wordCount = word.split(' ').length
  if (word.length > MAX_CHARS || wordCount > MAX_WORDS)
    return yield* Effect.fail(new InvalidWordInputError({ input: raw }))

  const ai = yield* AiService
  const verdict = yield* ai
    .generateObject(WordVerdict, verdictPrompt(word), {
      model: VERIFIER_MODEL,
      reasoningEffort: 'minimal',
    })
    .pipe(
      Effect.withSpan('VerifyWordInput.judge', {
        attributes: { 'gen_ai.model': VERIFIER_MODEL },
      }),
      // Fail-open but not silent: log before admitting, so a persistently broken judge (bad model
      // id / expired key) is observable rather than a silent no-op gate.
      Effect.tapError((cause) =>
        Effect.logWarning('word-input judge unavailable — failing open', cause),
      ),
      Effect.orElseSucceed(() =>
        WordVerdict.make({ isValid: true, reason: 'judge unavailable — fail-open' }),
      ),
    )

  if (!verdict.isValid) return yield* Effect.fail(new InvalidWordInputError({ input: raw }))
  return word
})
