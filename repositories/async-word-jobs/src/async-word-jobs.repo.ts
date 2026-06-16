import type {
  AsyncJobStatus,
  AsyncWordJobRow,
  EffectDrizzleQueryError,
  Language,
  WordJobStage,
} from '@lexiai/database'
import { asyncWordJobsTable, DB, patchOnConflict } from '@lexiai/database'
import { type Arrayable, isArray, toArray } from '@lexiai/utils'
import { and, eq, inArray } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'
import type { StagePatch } from './stage-patch'

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
 * `saveStages`' input-inferred shape: a single patch returns the one saved row; an array returns a
 * row per patch — each with its own payload, saved by its own `INSERT … ON CONFLICT DO UPDATE`.
 */
type SaveStages = {
  (
    language: Language,
    word: string,
    patch: StagePatch,
  ): Effect.Effect<AsyncWordJobRow, EffectDrizzleQueryError>
  (
    language: Language,
    word: string,
    patches: readonly StagePatch[],
  ): Effect.Effect<readonly AsyncWordJobRow[], EffectDrizzleQueryError>
}

/**
 * Word-generation persistence over the flat `async_word_jobs` table (one row per
 * `(word, language, stage)`). Two deep methods cover the whole lifecycle: `findStages` reads,
 * `saveStages` writes — seeding/reset included (a run starts, and a regen re-runs, by saving
 * `stagePatch.pending` patches, which reset the same rows in place via the
 * `UNIQUE(word, language, stage)` upsert). No payload, no separate run row, no history.
 *
 * Purely functional persistence: no method checks domain invariants or fails with a domain error —
 * a save lands the given state whether or not the row existed; absence on reads is an empty array.
 *
 * @see `repositories/async-word-jobs/CLAUDE.md`
 */
export class AsyncWordJobsRepo extends Context.Service<
  AsyncWordJobsRepo,
  {
    /** Read a word's stages, scoped to `(language, word)` and narrowed by `stage`/`status`. Unordered. */
    readonly findStages: (
      query: AsyncWordJobsQuery,
    ) => Effect.Effect<AsyncWordJobRow[], EffectDrizzleQueryError>
    /**
     * Save one stage state or many — each {@link StagePatch} names its row and carries its own
     * payload; the upsert on `UNIQUE(word, language, stage)` inserts the row if it never existed,
     * patches it otherwise (merge-patch: a carried field lands verbatim — explicit `null` clears the
     * column — an absent field leaves it untouched). Payloads come from {@link stagePatch} — never
     * hand-roll the status ⇄ timestamp pairing. An array runs one statement per patch (no
     * transaction), so a batch is **not** atomic across patches; the same stage twice in one batch
     * is last-write-wins, not an error.
     */
    readonly saveStages: SaveStages
  }
>()('@lexiai/repositories-async-word-jobs/AsyncWordJobsRepo') {}

export const AsyncWordJobsRepoLive = Layer.effect(
  AsyncWordJobsRepo,
  Effect.gen(function* () {
    const db = yield* DB

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

    const saveStages = ((language: Language, word: string, patch: Arrayable<StagePatch>) =>
      Effect.gen(function* () {
        const rows: AsyncWordJobRow[] = []
        // One statement per patch. A single ON CONFLICT statement carries one shared SET, but each
        // patch sets only the columns it carries (merge-patch via `patchOnConflict`), so two patches
        // of different shape can't share a statement — a per-patch loop scopes every SET to its own
        // row. No transaction: a failing patch leaves earlier ones applied (CLAUDE.md).
        for (const p of toArray(patch)) {
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

        if (isArray(patch)) return rows
        const [first] = rows
        if (!first)
          return yield* Effect.die(
            new Error('AsyncWordJobsRepo.saveStages: upsert returned no row'),
          )
        return first
      })) as SaveStages

    return AsyncWordJobsRepo.of({ findStages, saveStages })
  }),
)
