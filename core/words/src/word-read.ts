import type { Language } from '@kotodama/database'
import { selectWord } from '@kotodama/repositories-words'
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
  const row = yield* selectWord(language, word)
  return yield* Option.match(row, {
    onNone: () => Effect.succeedNone,
    onSome: (r) => Effect.asSome(decodeWord(r)),
  })
})
