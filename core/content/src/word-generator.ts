import {
  enumAsyncJobStatus,
  enumWordBuildStage,
  type Language,
  WORD_BUILD_STAGES,
  type WordBuildErrorEntity,
  type WordBuildStage,
  type WordBuildStageEntity,
  type WordBuildStagesEntity,
} from '@kotodama/database'
import { Data, Effect } from 'effect'
import { ContentEngine } from './content-engine.service'
import type { WordGrounding } from './stage-slices'
import type { WordContent } from './word-content.schema'

/**
 * Carries the complete per-stage picture of a failed generation — one entry per pipeline stage, in
 * `WORD_BUILD_STAGES` order: each `succeeded`, `failed` with its error, or `pending` for a stage a
 * fail-fast gate never reached.
 */
export class WordGenerationError extends Data.TaggedError('WordGenerationError')<{
  readonly outcome: WordBuildStagesEntity
}> {}

/**
 * Complete the stages that ran into that full picture — one entry per stage, in `WORD_BUILD_STAGES`
 * order: a stage present in `ran` is carried through as it ended, every stage a fail-fast gate
 * skipped is `pending`. Pure, so the never-ran → `pending` reset is unit-proved without the engine.
 */
export function stagesFromOutcome(ran: WordBuildStagesEntity): WordBuildStagesEntity {
  const ranByStage = new Map(ran.map((entry) => [entry.stage, entry] as const))

  return WORD_BUILD_STAGES.map(
    (stage): WordBuildStageEntity =>
      ranByStage.get(stage) ?? { stage, status: enumAsyncJobStatus.pending },
  )
}

/** Independent passes that ground on `fetch_source`, so they run concurrently. */
const ENRICH_STAGES = [
  enumWordBuildStage.enrich_etymology,
  enumWordBuildStage.enrich_tiers,
  enumWordBuildStage.enrich_authors,
  enumWordBuildStage.enrich_visuals,
] as const

/**
 * The one statement of the generation topology: ground → 4 concurrent enrich → review. The
 * sequential gates fail fast; the enrich fan-out runs under `Effect.partition` (every pass runs,
 * the effect never fails), so one bad enrich neither interrupts its siblings nor hides them.
 * Persists nothing — the caller decides what success/failure mean; the wall-clock budget is the
 * `withBuildBudget` decorator's, not here.
 */
export const generateWordContent = Effect.fnUntraced(function* (language: Language, word: string) {
  const engine = yield* ContentEngine

  // Surfaces an engine error verbatim as `{ stage, error }` — `cause` is already serializable.
  const runStage = <S extends WordBuildStage>(stage: S, grounding?: WordGrounding) =>
    engine.produce(stage, language, word, grounding).pipe(
      Effect.mapError((engineError) => ({
        stage,
        error: {
          type: engineError.type,
          message: engineError.message,
          cause: engineError.cause,
        } satisfies WordBuildErrorEntity,
      })),
    )

  const source = yield* runStage(enumWordBuildStage.fetch_source).pipe(
    Effect.mapError(
      ({ stage, error }) =>
        new WordGenerationError({
          outcome: stagesFromOutcome([{ stage, status: enumAsyncJobStatus.failed, error }]),
        }),
    ),
  )

  const [failures, successes] = yield* Effect.partition(
    ENRICH_STAGES,
    (stage) => runStage(stage, source).pipe(Effect.map((slice) => ({ stage, slice }))),
    { concurrency: 'unbounded' },
  )

  // Every stage attempted so far, as it ended: `fetch_source` is in hand, the enrich fan-out split
  // into successes and typed failures. Stages a fail-fast gate skipped are absent —
  // `stagesFromOutcome` completes them `pending`.
  const ran: WordBuildStagesEntity = [
    { stage: enumWordBuildStage.fetch_source, status: enumAsyncJobStatus.succeeded },
    ...successes.map(({ stage }) => ({ stage, status: enumAsyncJobStatus.succeeded })),
    ...failures.map(({ stage, error }) => ({ stage, status: enumAsyncJobStatus.failed, error })),
  ]
  if (failures.length > 0)
    return yield* Effect.fail(new WordGenerationError({ outcome: stagesFromOutcome(ran) }))

  const review = yield* runStage(enumWordBuildStage.final_review, source).pipe(
    Effect.mapError(
      ({ stage, error }) =>
        new WordGenerationError({
          outcome: stagesFromOutcome([...ran, { stage, status: enumAsyncJobStatus.failed, error }]),
        }),
    ),
  )

  // The six disjoint slices together cover WordContent (STAGE_SLICES guarantees it), unprovable to TS.
  const enrichSlices = successes.map(({ slice }) => slice)
  return Object.assign({}, source, ...enrichSlices, review) as WordContent
})
