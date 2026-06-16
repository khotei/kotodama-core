import type { EffectDrizzleQueryError, Language } from '@lexiai/database'
import { AsyncWordJobsRepo } from '@lexiai/repositories-async-word-jobs'
import { WordsRepo } from '@lexiai/repositories-words'
import { Context, Effect, Layer, Option } from 'effect'
import type { WordStateModel } from './word-state.model'
import { deriveWordState } from './word-state-derive'

/**
 * Resolves the {@link WordStateModel} of a `(word, language)` behind `GET /words/:language/:word/state`.
 * `get` is the imperative shell: it fetches both halves — `WordsRepo.find` (the word row) +
 * `AsyncWordJobsRepo.findStages` (the stages) — and hands them to the pure
 * {@link deriveWordState}, the single author of the `succeeded`/`running`/`failed`/`Option.none`
 * collapse (so no consumer recomputes it). Depends only on the two repos (leaves), not on the
 * sibling `WordFinder` read use case. Never writes.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export class WordBuildState extends Context.Service<
  WordBuildState,
  {
    readonly get: (
      language: Language,
      word: string,
    ) => Effect.Effect<Option.Option<WordStateModel>, EffectDrizzleQueryError>
  }
>()('@lexiai/core-async-word-jobs/WordBuildState') {}

export const WordBuildStateLive = Layer.effect(
  WordBuildState,
  Effect.gen(function* () {
    const words = yield* WordsRepo
    const jobs = yield* AsyncWordJobsRepo

    const get: WordBuildState['Service']['get'] = Effect.fnUntraced(function* (language, word) {
      const {
        words: [found],
        stageRows,
      } = yield* Effect.all(
        {
          words: words.find({ language, word, limit: 1 }),
          stageRows: jobs.findStages({ language, word }),
        },
        { concurrency: 'unbounded' },
      )
      return deriveWordState(Option.fromNullishOr(found), stageRows)
    })

    return WordBuildState.of({ get })
  }),
)
