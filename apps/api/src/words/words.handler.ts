import { readWordBuildSnapshot } from '@lexiai/core-async-word-jobs'
import { decodeWord, ensureReadyWord, findWord, type Word } from '@lexiai/core-words'
import { searchWords, selectWordCounts } from '@lexiai/repositories-words'
import { requestWordBuild } from '@lexiai/use-cases'
import { Effect, Option } from 'effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { paginate } from '../pagination.view'
import { collapseWordState } from './word-state-collapse'
import { WordsApi } from './words.api'

// Throughout: infra faults (repo/queue unreachable, impossible-state decode failures) are `die`d
// to 500s; only the errors declared on each endpoint pass through as typed 4xx.
export const WordsApiLive = HttpApiBuilder.group(WordsApi, 'words', (handlers) =>
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
      Effect.gen(function* () {
        // The snapshot's word is already the decoded `Option<Word>` — collapse reads the row's own
        // `status`, so no decode juggling here.
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
        Effect.catchTags({
          EffectDrizzleQueryError: Effect.die,
          QueueError: Effect.die,
          SqlError: Effect.die,
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
