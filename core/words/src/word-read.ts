import { selectWord } from '@kotodama/core/repositories'
import type { Language } from '@kotodama/database'
import { Effect, Option } from 'effect'
import { decodeWord } from './word.schema'

/**
 * The decoded single-word read: `selectWord` + {@link decodeWord} in one step, so every read
 * boundary gets the domain {@link Word} union (absent ⇒ `None`) without repeating the decode.
 *
 * Raw-row callers that only need the lifecycle `status` (the admission gate `ensureWordBuildable`,
 * bare existence checks) keep using `selectWord` directly — decoding a building row is wasted work.
 */
export const findWord = Effect.fnUntraced(function* (language: Language, word: string) {
  const found = yield* selectWord(language, word)
  return yield* Option.match(found, {
    onNone: () => Effect.succeedNone,
    onSome: (wordRow) => Effect.asSome(decodeWord(wordRow)),
  })
})
