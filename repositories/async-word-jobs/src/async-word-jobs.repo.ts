import type {
  AsyncJobStatus,
  AsyncWordJobRow,
  EffectDrizzleQueryError,
  Language,
  WordJobStage,
} from '@lexiai/database'
import { asyncWordJobsTable, DB, patchOnConflict } from '@lexiai/database'
import { and, eq, inArray } from 'drizzle-orm'
import { Array as Arr, Effect } from 'effect'
import type { StagePatch } from './stage-patch'

/** A single value or a readonly batch of them — the repo's single-or-array filter/payload idiom. */
type Arrayable<T> = T | readonly T[]

/**
 * A read over one word's stages: always scoped to `(language, word)`, optionally narrowed by `stage`
 * and/or `status` (each a single value or an array). Rows come back **unordered** — sort at the call
 * site (e.g. by `wordJobStage` declaration order) if a stepper needs it. The single flexible read
 * behind every API/core question.
 */
export type AsyncWordJobsQuery = {
  readonly language: Language
  readonly word: string
  readonly stage?: Arrayable<WordJobStage>
  readonly status?: Arrayable<AsyncJobStatus>
}

/**
 * `upsertWordJobStages`' input-inferred shape: a single patch returns the one upserted row; an array
 * returns a row per patch — each with its own payload, by its own `INSERT … ON CONFLICT DO UPDATE`.
 */
type UpsertWordJobStages = {
  (
    language: Language,
    word: string,
    patch: StagePatch,
  ): Effect.Effect<AsyncWordJobRow, EffectDrizzleQueryError, DB>
  (
    language: Language,
    word: string,
    patches: readonly StagePatch[],
  ): Effect.Effect<readonly AsyncWordJobRow[], EffectDrizzleQueryError, DB>
}

/**
 * Read one word's stage rows from the flat `async_word_jobs` table, scoped to `(language, word)` and
 * narrowed by `stage`/`status`. **Unordered** (a stepper sorts by `wordJobStage` declaration order);
 * absence is an empty array. A raw `SELECT` over `DB` (which it `yield*`s). A bare persistence function
 * (the `select` verb marks the layer), not a `Context.Service`.
 *
 * @see `repositories/async-word-jobs/CLAUDE.md`
 */
export const selectWordJobStages = Effect.fnUntraced(function* (query: AsyncWordJobsQuery) {
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
 * Upsert one stage state or many — each {@link StagePatch} names its row and carries its own payload;
 * the upsert on `UNIQUE(word, language, stage)` inserts the row if it never existed, patches it
 * otherwise (merge-patch: a carried field lands verbatim — explicit `null` clears the column — an
 * absent field leaves it untouched). Payloads come from {@link stagePatch} — never hand-roll the
 * status ⇄ timestamp pairing. Seeding/reset is the same call (a run starts, and a regen re-runs, by
 * upserting `stagePatch.pending` patches that reset the rows in place). An array runs one statement
 * per patch (no transaction), so a batch is **not** atomic across patches; the same stage twice in one
 * batch is last-write-wins, not an error. A bare persistence function (the `upsert` verb marks the
 * layer), not a `Context.Service` — it checks no domain invariant and fails with no domain error.
 *
 * @see `repositories/async-word-jobs/CLAUDE.md`
 */
export const upsertWordJobStages = ((
  language: Language,
  word: string,
  patch: Arrayable<StagePatch>,
) =>
  Effect.gen(function* () {
    const db = yield* DB
    const rows: AsyncWordJobRow[] = []
    // One statement per patch. A single ON CONFLICT statement carries one shared SET, but each
    // patch sets only the columns it carries (merge-patch via `patchOnConflict`), so two patches
    // of different shape can't share a statement — a per-patch loop scopes every SET to its own
    // row. No transaction: a failing patch leaves earlier ones applied (CLAUDE.md).
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
