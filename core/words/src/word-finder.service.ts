import type { EffectDrizzleQueryError, Language, WordRow } from '@lexiai/database'
import { WordsRepo } from '@lexiai/repositories-words'
import { Context, Effect, Layer, Option } from 'effect'

/**
 * The pure word read behind `GET /words/:language/:word`. `find` returns the {@link WordRow} when a
 * `words` row exists, else `Option.none` — absence is a value, never an error (deep-modules §6),
 * which is why it is `find`, not `get`. Never writes.
 *
 * @see `core/words/CLAUDE.md`
 */
export class WordFinder extends Context.Service<
  WordFinder,
  {
    readonly find: (
      language: Language,
      word: string,
    ) => Effect.Effect<Option.Option<WordRow>, EffectDrizzleQueryError>
  }
>()('@lexiai/core-words/WordFinder') {}

export const WordFinderLive = Layer.effect(
  WordFinder,
  Effect.gen(function* () {
    const words = yield* WordsRepo

    const find: WordFinder['Service']['find'] = Effect.fnUntraced(function* (language, word) {
      const [wordRow] = yield* words.find({ language, word, limit: 1 })
      return Option.fromNullishOr(wordRow)
    })

    return WordFinder.of({ find })
  }),
)
