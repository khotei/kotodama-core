import {
  enumWordJobStage,
  type JobError,
  type Language,
  type WordContent,
  type WordJobStage,
} from '@lexiai/database'
import { Data, Effect } from 'effect'
import { ContentEngine } from './content-engine.service'
import type { WordGrounding } from './stage-slices'

/**
 * Generation failed. `failures` names every pass that failed (each with its typed {@link JobError});
 * `succeeded` names the passes that had completed before the build was abandoned. Together they let the
 * caller record the **full** per-stage picture — what failed *and* what succeeded — not only the
 * failures; passes that never ran (downstream of the failure) appear in neither and stay untouched. The
 * concurrent enrich fan-out is *settled*, not aborted on the first failure, so a multi-stage failure
 * reports every reason. A sequential gate failure (`fetch_source`/`final_review`) is a one-element
 * `failures`. Rides the error channel — the caller disposes of it.
 */
export class WordGenerationError extends Data.TaggedError('WordGenerationError')<{
  readonly failures: ReadonlyArray<{ readonly stage: WordJobStage; readonly error: JobError }>
  readonly succeeded: ReadonlyArray<WordJobStage>
}> {}

/** The enrich dimensions — independent passes that ground on `fetch_source`, so they run concurrently. */
const ENRICH_STAGES = [
  enumWordJobStage.enrich_etymology,
  enumWordJobStage.enrich_tiers,
  enumWordJobStage.enrich_authors,
  enumWordJobStage.enrich_visuals,
] as const

/**
 * Generate a word's content end to end — the single statement of **how a word's content is generated**:
 * ground it (`fetch_source`), enrich the four independent dimensions concurrently on that grounding,
 * then review (`final_review`). Returns the merged {@link WordContent}; **fails** with
 * {@link WordGenerationError} (carrying every failed *and* succeeded pass) if any pass fails. It persists
 * nothing — the caller decides what success and failure mean.
 *
 * **Sequential gates fail-fast, the enrich fan-out partitions.** `fetch_source` grounds the rest, so its
 * failure stops everything; `final_review` is the closing pass. The four enrich passes run under
 * {@link Effect.partition} (every element runs, the effect never fails), so one bad pass neither
 * interrupts its siblings nor hides them — every reason and every success is collected.
 *
 * Per-stage execution funnels through one private {@link runStage} — *the* seam: produce, then surface an
 * engine error verbatim as a `{ stage, error: JobError }` failure (`message`/`cause` straight from the
 * engine — `cause` is already the serializable provider snapshot or `undefined`). The wall-clock budget
 * is **not** here — it is one whole-build timeout owned by the worker use-case (`buildWord`,
 * `@lexiai/use-cases`); this recipe just runs to completion or fails. A plain `Effect.fnUntraced`.
 *
 * @see `core/content/CLAUDE.md`
 */
export const generateWordContent = Effect.fnUntraced(function* (language: Language, word: string) {
  const engine = yield* ContentEngine

  // One pass — the single per-stage seam: produce, surfacing an engine error verbatim as a
  // `{ stage, error }` failure (the partition collects them; the gates catch them).
  const runStage = <S extends WordJobStage>(stage: S, grounding?: WordGrounding) =>
    engine.produce(stage, language, word, grounding).pipe(
      Effect.mapError((engineError) => ({
        stage,
        error: {
          type: engineError.type,
          message: engineError.message,
          cause: engineError.cause,
        } satisfies JobError,
      })),
    )

  // Abort the whole build, naming every failed pass and every one that had already succeeded.
  const abort = (
    failures: ReadonlyArray<{ stage: WordJobStage; error: JobError }>,
    succeeded: ReadonlyArray<WordJobStage>,
  ) => Effect.fail(new WordGenerationError({ failures, succeeded }))

  // 1 ▸ Ground the entry — `fetch_source` feeds every later pass, so its failure stops the build with
  //     nothing yet succeeded.
  const source = yield* runStage(enumWordJobStage.fetch_source).pipe(
    Effect.catch(({ stage, error }) => abort([{ stage, error }], [])),
  )

  // 2 ▸ Enrich the four dimensions concurrently on that grounding — partition runs every pass and
  //     never fails, so every failure reason and every success survives.
  const [failures, successes] = yield* Effect.partition(
    ENRICH_STAGES,
    (stage) => runStage(stage, source).pipe(Effect.map((slice) => ({ stage, slice }))),
    { concurrency: 'unbounded' },
  )
  const succeeded = [enumWordJobStage.fetch_source, ...successes.map((s) => s.stage)]
  if (failures.length > 0) return yield* abort(failures, succeeded)

  // 3 ▸ Close with the review pass (it grounds on `source` too) — fail-fast, carrying what succeeded.
  const review = yield* runStage(enumWordJobStage.final_review, source).pipe(
    Effect.catch(({ stage, error }) => abort([{ stage, error }], succeeded)),
  )

  // The six disjoint slices together cover WordContent (STAGE_SLICES guarantees it), unprovable to TS.
  const enrichSlices = successes.map((s) => s.slice)
  return Object.assign({}, source, ...enrichSlices, review) as WordContent
})
