import { decodeWord, ensureReadyWord, findWord, type Word } from '@kotodama/core-words'
import { enumAsyncJobStatus } from '@kotodama/database'
import { searchWords, selectWordCounts } from '@kotodama/repositories-words'
import { requestWordBuild } from '@kotodama/use-cases'
import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { KotodamaApi } from '../kotodama.api'
import { paginate } from '../pagination.view'
import { collapseWordState, toStageProgress } from './word-state-collapse'

// Throughout: infra faults (repo/queue unreachable, impossible-state decode failures) are `die`d
// to 500s; only the errors declared on each endpoint pass through as typed 4xx.
export const WordsApiLive = HttpApiBuilder.group(KotodamaApi, 'words', (handlers) =>
  handlers
    .handle('getWord', (ctx) =>
      Effect.gen(function* () {
        // Absence settles here (200 null); the pure gate is the single author of the 409.
        const word = yield* findWord(ctx.params.language, ctx.params.word)
        if (Option.isNone(word)) return null
        return yield* ensureReadyWord(word.value)
      }).pipe(Effect.catchTags({ EffectDrizzleQueryError: Effect.die, SchemaError: Effect.die })),
    )
    .handle('getWordState', (ctx) =>
      // The word carries its `stages` inline, so one decoded read is the whole snapshot — collapse
      // reads the row's own `status` and stages, no second query.
      findWord(ctx.params.language, ctx.params.word).pipe(
        Effect.map((word) => Option.getOrNull(collapseWordState(word))),
        Effect.orDie,
      ),
    )
    .handle('buildWord', (ctx) =>
      requestWordBuild(ctx.params.language, ctx.params.word).pipe(
        // The seed just landed `pending` (the worker flips it `running` later), so the response is
        // that state verbatim — no collapse, assemble the stepper straight from the seeded row's stages.
        Effect.map((seeded) => ({
          status: enumAsyncJobStatus.pending,
          stages: toStageProgress(seeded.stages),
        })),
        Effect.catchTags({
          EffectDrizzleQueryError: Effect.die,
          QueueError: Effect.die,
        }),
      ),
    )
    .handle('search', (ctx) =>
      Effect.gen(function* () {
        const { language } = ctx.params
        // `page`/`limit` are decode-defaulted by the query schema — always present here.
        const { q, status, page, limit } = ctx.query
        const result = yield* searchWords({ language, q, status, page, limit })
        const items: Word[] = yield* Effect.forEach(result.items, (row) => decodeWord(row))
        return paginate(items, { page, limit, total: result.total })
      }).pipe(Effect.catchTags({ EffectDrizzleQueryError: Effect.die, SchemaError: Effect.die })),
    )
    .handle('counts', (ctx) =>
      Effect.gen(function* () {
        const { language } = ctx.params
        const { q, status } = ctx.query
        // Counts read the same `wordSearchFilter` the list pages, so they always agree.
        return yield* selectWordCounts({ language, q, status })
      }).pipe(Effect.orDie),
    ),
)
