import type {
  AsyncJobStatus,
  AsyncWordJobRow,
  EffectDrizzleQueryError,
  Language,
  WordJobStage,
} from '@kotodama/database'
import { asyncWordJobsTable, DB, patchOnConflict } from '@kotodama/database'
import { and, eq, inArray } from 'drizzle-orm'
import { Array as Arr, Effect } from 'effect'

type Arrayable<T> = T | readonly T[]

// Rows come back UNORDERED — a stepper sorts by the `wordJobStage` declaration order.
export type AsyncWordJobQuery = {
  readonly language: Language
  readonly word: string
  readonly stage?: Arrayable<WordJobStage>
  readonly status?: Arrayable<AsyncJobStatus>
}

/**
 * Merge-patch payload: an **absent** field leaves the stored column untouched, an explicit
 * **`null` clears it** (so a `succeeded` patch can't erase the `startedAt` its `running`
 * predecessor stamped — it simply doesn't carry the key). Author payloads through `stagePatch` —
 * the single owner of the status ⇄ timestamp pairing.
 */
export type AsyncWordJobUpsert = {
  readonly stage: AsyncWordJobRow['stage']
  readonly status: AsyncWordJobRow['status']
  readonly result?: AsyncWordJobRow['result']
  readonly error?: AsyncWordJobRow['error']
  readonly startedAt?: AsyncWordJobRow['startedAt']
  readonly finishedAt?: AsyncWordJobRow['finishedAt']
}

type UpsertWordJobStages = {
  (
    language: Language,
    word: string,
    patch: AsyncWordJobUpsert,
  ): Effect.Effect<AsyncWordJobRow, EffectDrizzleQueryError, DB>
  (
    language: Language,
    word: string,
    patches: readonly AsyncWordJobUpsert[],
  ): Effect.Effect<readonly AsyncWordJobRow[], EffectDrizzleQueryError, DB>
}

export const selectWordJobStages = Effect.fnUntraced(function* (query: AsyncWordJobQuery) {
  const db = yield* DB
  const stages = query.stage === undefined ? [] : Arr.ensure(query.stage)
  const statuses = query.status === undefined ? [] : Arr.ensure(query.status)
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
})

/**
 * A never-initialized stage is **created** by the upsert, so seeding/reset is this same call (a
 * regen re-runs by upserting `stagePatch.pending` patches, whose explicit nulls reset the rows in
 * place). The same stage twice in one batch is last-write-wins, not an error.
 */
export const upsertWordJobStages = ((
  language: Language,
  word: string,
  patch: Arrayable<AsyncWordJobUpsert>,
) =>
  Effect.gen(function* () {
    const db = yield* DB
    const rows: AsyncWordJobRow[] = []
    // One statement per patch — differently-shaped patches can't share one SET. No transaction:
    // a failing patch leaves earlier ones applied.
    for (const p of Arr.ensure(patch)) {
      const value = { language, word, ...p }
      rows.push(
        ...(yield* db
          .insert(asyncWordJobsTable)
          .values(value)
          .onConflictDoUpdate({
            target: [
              asyncWordJobsTable.word,
              asyncWordJobsTable.language,
              asyncWordJobsTable.stage,
            ],
            set: patchOnConflict(asyncWordJobsTable, value),
          })
          .returning()),
      )
    }

    if (Arr.isArray(patch)) return rows
    const [first] = rows
    if (!first) return yield* Effect.die(new Error('upsertWordJobStages: upsert returned no row'))
    return first
  })) as UpsertWordJobStages
