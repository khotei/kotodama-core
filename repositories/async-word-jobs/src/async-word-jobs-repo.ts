import type {
  AsyncJobStatus,
  AsyncWordJobRow,
  EffectDrizzleQueryError,
  JobError,
  Language,
  SqlError,
  StageResult,
  WordJobStage,
} from '@lexiai/database'
import { asyncWordJobsTable, DB, enumAsyncJobStatus, wordJobStage } from '@lexiai/database'
import { isReadonlyArray, toArray } from '@lexiai/utils'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Context, Data, Effect, Layer } from 'effect'

export class WordStageNotFoundError extends Data.TaggedError('WordStageNotFoundError')<{
  readonly language: Language
  readonly word: string
  readonly stage: WordJobStage
}> {}

/**
 * A transition to apply to one stage (identified by `stage`). `patchStages` derives the lifecycle
 * columns from `status` — `running` stamps `startedAt` + bumps `attempts`, a terminal status stamps
 * `finishedAt` — so a caller supplies only the outcome, never the bookkeeping.
 */
export type StagePatch = {
  readonly stage: WordJobStage
  readonly status: AsyncJobStatus
  readonly result?: StageResult
  readonly error?: JobError
}

/**
 * `patchStages`' input-inferred shape: a single patch returns the one updated row; an array returns a
 * row per patch, applied **atomically** in a transaction (hence the extra `SqlError` on that overload —
 * a mid-array failure rolls the whole batch back). A missing stage (never `initialize`d) fails
 * {@link WordStageNotFoundError}.
 */
type PatchStages = {
  (
    language: Language,
    word: string,
    patch: StagePatch,
  ): Effect.Effect<AsyncWordJobRow, EffectDrizzleQueryError | WordStageNotFoundError>
  (
    language: Language,
    word: string,
    patch: readonly StagePatch[],
  ): Effect.Effect<
    readonly AsyncWordJobRow[],
    EffectDrizzleQueryError | WordStageNotFoundError | SqlError
  >
}

/**
 * A read over one word's stages: always scoped to `(language, word)`, optionally narrowed by `stage`
 * and/or `status` (each a single value or an array). Rows come back **unordered** — sort at the call
 * site (e.g. by `wordJobStage` declaration order) if a stepper needs it. The single flexible read
 * behind every API/core question.
 */
export type AsyncWordJobsQuery = {
  readonly language: Language
  readonly word: string
  readonly stage?: readonly WordJobStage[] | WordJobStage
  readonly status?: readonly AsyncJobStatus[] | AsyncJobStatus
}

/**
 * Word-generation orchestration over the flat `async_word_jobs` table (one row per
 * `(word, language, stage)`). Three deep methods cover the whole lifecycle: `initializeStages`
 * seeds/resets a word's stage rows, `findStages` reads them, `patchStages` advances one or many. No
 * payload, no separate run row, no history — a regeneration re-runs `initializeStages` on the same rows.
 *
 * @see `repositories/async-word-jobs/CLAUDE.md`
 */
export class AsyncWordJobsRepo extends Context.Service<
  AsyncWordJobsRepo,
  {
    /**
     * Seed one `pending` row per planned stage for a word about to be generated — the first step of a
     * run. Idempotent and the regen path in one: an existing word's rows are **reset in place** to
     * `pending` (status/attempts/result/error/timestamps cleared) via the
     * `UNIQUE(word, language, stage)` upsert. Returns the seeded rows (unordered); `stages` defaults to
     * the full pipeline.
     */
    readonly initializeStages: (
      language: Language,
      word: string,
      stages?: readonly WordJobStage[],
    ) => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>
    /** Read a word's stages, scoped to `(language, word)` and narrowed by `stage`/`status`. Unordered. */
    readonly findStages: (
      query: AsyncWordJobsQuery,
    ) => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>
    /**
     * Advance one stage, or a batch atomically. A single {@link StagePatch} returns the updated row;
     * an array returns a row per patch in a transaction (all-or-nothing). Missing stage ⇒
     * {@link WordStageNotFoundError}.
     */
    readonly patchStages: PatchStages
  }
>()('@lexiai/repositories-async-word-jobs/AsyncWordJobsRepo') {}

export const AsyncWordJobsRepoLive = Layer.effect(
  AsyncWordJobsRepo,
  Effect.gen(function* () {
    const db = yield* DB

    const initializeStages: AsyncWordJobsRepo['Service']['initializeStages'] = Effect.fnUntraced(
      function* (language, word, stages = wordJobStage.enumValues) {
        return yield* db
          .insert(asyncWordJobsTable)
          .values(stages.map((stage) => ({ language, word, stage })))
          .onConflictDoUpdate({
            target: [
              asyncWordJobsTable.word,
              asyncWordJobsTable.language,
              asyncWordJobsTable.stage,
            ],
            set: {
              status: enumAsyncJobStatus.pending,
              attempts: 0,
              result: null,
              error: null,
              startedAt: null,
              finishedAt: null,
            },
          })
          .returning()
      },
    )

    const findStages: AsyncWordJobsRepo['Service']['findStages'] = Effect.fnUntraced(
      function* (query) {
        const stages = toArray(query.stage)
        const statuses = toArray(query.status)
        return yield* db
          .select()
          .from(asyncWordJobsTable)
          .where(
            and(
              eq(asyncWordJobsTable.word, query.word),
              eq(asyncWordJobsTable.language, query.language),
              stages.length > 0 ? inArray(asyncWordJobsTable.stage, stages) : undefined,
              statuses.length > 0 ? inArray(asyncWordJobsTable.status, statuses) : undefined,
            ),
          )
      },
    )

    // Executor threaded so the array path runs on `tx` (atomic). `db` (EffectPgDatabase) and the tx
    // (EffectPgTransaction) are siblings under PgEffectDatabase — neither assignable to the other — so
    // accept the union; both expose the same `.update().set().where().returning()` builder.
    type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

    const patchOne = (exec: Executor, language: Language, word: string, patch: StagePatch) =>
      Effect.gen(function* () {
        const running = patch.status === enumAsyncJobStatus.running
        const terminal =
          patch.status === enumAsyncJobStatus.succeeded ||
          patch.status === enumAsyncJobStatus.failed
        const [row] = yield* exec
          .update(asyncWordJobsTable)
          .set({
            status: patch.status,
            ...(running
              ? { startedAt: new Date(), attempts: sql`${asyncWordJobsTable.attempts} + 1` }
              : {}),
            ...(terminal ? { finishedAt: new Date() } : {}),
            ...(patch.result !== undefined ? { result: patch.result } : {}),
            ...(patch.error !== undefined ? { error: patch.error } : {}),
          })
          .where(
            and(
              eq(asyncWordJobsTable.word, word),
              eq(asyncWordJobsTable.language, language),
              eq(asyncWordJobsTable.stage, patch.stage),
            ),
          )
          .returning()
        if (!row) {
          return yield* Effect.fail(
            new WordStageNotFoundError({ language, word, stage: patch.stage }),
          )
        }
        return row
      })

    // `patchStages` is overloaded (single→row, array→row[]); a union-returning arrow can't be *assigned*
    // to that overload set, so assert it with `as PatchStages` (the single source the member also uses).
    // Narrow assertion: the body is still fully typechecked — a wrong call or a grossly-wrong return
    // shape still errors; `as` only bridges the union→overload gap TS can't otherwise infer.
    const patchStages = ((
      language: Language,
      word: string,
      patch: StagePatch | readonly StagePatch[],
    ) =>
      isReadonlyArray(patch)
        ? db.transaction((tx) => Effect.forEach(patch, (p) => patchOne(tx, language, word, p)))
        : patchOne(db, language, word, patch)) as PatchStages

    return AsyncWordJobsRepo.of({ initializeStages, findStages, patchStages })
  }),
)
