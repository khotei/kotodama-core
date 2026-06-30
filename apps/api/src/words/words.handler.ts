import { readWordBuildSnapshot } from '@lexiai/core-async-word-jobs'
import { selectWord } from '@lexiai/repositories-words'
import { requestWordBuild } from '@lexiai/use-cases'
import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { collapseWordState } from './word-state-collapse'
import { WordsApi } from './words.api'

/**
 * Binds the `words` group to the `core/*` reads + {@link requestWordBuild}. The state read pairs
 * {@link readWordBuildSnapshot} (the one imperative fetch) with the pure {@link collapseWordState} (its single
 * author, a view model owned here at the API edge); the build read collapses the rows
 * {@link requestWordBuild} hands back (`{ word: none, stages: seeded }` ⇒ `running`). A repo or queue
 * fault is infrastructure, not a domain outcome the reader recovers from, so it's `die`d to a 500 rather
 * than declared on the endpoint. `getWord`'s and `getWordState`'s absence is `null` (mapped with
 * `Option.getOrNull`); `buildWord`'s rejections (`WordAlreadyReadyError`/`InvalidWordInputError`) are
 * declared on the endpoint and pass through, while its infra faults are `catchTags`-`die`d.
 */
export const WordsApiLive = HttpApiBuilder.group(WordsApi, 'words', (handlers) =>
  handlers
    .handle('getWord', (ctx) =>
      Effect.gen(function* () {
        const found = yield* selectWord(ctx.params.language, ctx.params.word)
        return Option.getOrNull(found)
      }).pipe(Effect.orDie),
    )
    .handle('getWordState', (ctx) =>
      Effect.gen(function* () {
        const snapshot = yield* readWordBuildSnapshot(ctx.params.language, ctx.params.word)
        return Option.getOrNull(collapseWordState(snapshot))
      }).pipe(Effect.orDie),
    )
    .handle('buildWord', (ctx) =>
      requestWordBuild(ctx.params.language, ctx.params.word).pipe(
        // The use-case returns the seeded rows; the running view is assembled here (no `words` row yet).
        Effect.flatMap((seeded) =>
          collapseWordState({ word: Option.none(), stages: seeded }).pipe(
            Option.match({
              onNone: () => Effect.die(new Error('seeded build collapsed to no state')),
              onSome: Effect.succeed,
            }),
          ),
        ),
        // Only infra faults 500; the declared domain rejections pass through as typed 4xx.
        Effect.catchTags({ EffectDrizzleQueryError: Effect.die, QueueError: Effect.die }),
      ),
    ),
)
