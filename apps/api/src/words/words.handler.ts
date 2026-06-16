import { WordBuildRequester, WordBuildState } from '@lexiai/core-async-word-jobs'
import { WordFinder } from '@lexiai/core-words'
import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { WordsApi } from './words.api'

/**
 * Binds the `words` group to the `core/*` use cases. All handlers are intentionally thin (the depth
 * lives in {@link WordFinder} / {@link WordBuildState} / {@link WordBuildRequester}); a repo or queue
 * fault is infrastructure, not a domain outcome the reader recovers from, so it's `die`d to a 500
 * rather than declared on the endpoint. `getWord`'s and `getWordState`'s absence is `null` (the
 * services return `Option`, mapped with `Option.getOrNull`); `buildWord`'s two rejections
 * (`WordAlreadyReadyError`/`InvalidWordInputError`) are declared on the endpoint and pass through, while
 * its infra faults are `catchTags`-`die`d — so the reads need no error channel and the create's is just those two.
 */
export const WordsApiLive = HttpApiBuilder.group(WordsApi, 'words', (handlers) =>
  handlers
    .handle('getWord', (ctx) =>
      WordFinder.pipe(
        Effect.flatMap((finder) => finder.find(ctx.params.language, ctx.params.word)),
        Effect.map(Option.getOrNull),
        Effect.orDie,
      ),
    )
    .handle('getWordState', (ctx) =>
      WordBuildState.pipe(
        Effect.flatMap((buildState) => buildState.get(ctx.params.language, ctx.params.word)),
        Effect.map(Option.getOrNull),
        Effect.orDie,
      ),
    )
    .handle('buildWord', (ctx) =>
      WordBuildRequester.pipe(
        Effect.flatMap((requester) => requester.request(ctx.params.language, ctx.params.word)),
        // The three domain rejections (WordAlreadyReadyError / WordBuildInProgressError /
        // InvalidWordInputError) are declared on the endpoint and pass through; only infra faults are 500s.
        Effect.catchTags({ EffectDrizzleQueryError: Effect.die, QueueError: Effect.die }),
      ),
    ),
)
