import {
  enumWordBuildStage,
  type Language,
  type WordBuildErrorEntity,
  type WordBuildStage,
} from '@kotodama/database'
import { Data, Effect } from 'effect'
import { ContentEngine } from './content-engine.service'
import type { WordGrounding } from './stage-slices'
import type { WordContent } from './word-content.schema'

/**
 * Carries every failed pass AND every pass that had completed — the caller records the full
 * per-stage picture; passes that never ran appear in neither list and stay untouched.
 */
export class WordGenerationError extends Data.TaggedError('WordGenerationError')<{
  readonly failures: ReadonlyArray<{
    readonly stage: WordBuildStage
    readonly error: WordBuildErrorEntity
  }>
  readonly succeeded: ReadonlyArray<WordBuildStage>
}> {}

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

  const genError = (
    failures: ReadonlyArray<{ stage: WordBuildStage; error: WordBuildErrorEntity }>,
    succeeded: ReadonlyArray<WordBuildStage>,
  ) => new WordGenerationError({ failures, succeeded })

  const source = yield* runStage(enumWordBuildStage.fetch_source).pipe(
    Effect.mapError(({ stage, error }) => genError([{ stage, error }], [])),
  )

  const [failures, successes] = yield* Effect.partition(
    ENRICH_STAGES,
    (stage) => runStage(stage, source).pipe(Effect.map((slice) => ({ stage, slice }))),
    { concurrency: 'unbounded' },
  )
  const succeeded = [enumWordBuildStage.fetch_source, ...successes.map((s) => s.stage)]
  if (failures.length > 0) return yield* Effect.fail(genError(failures, succeeded))

  const review = yield* runStage(enumWordBuildStage.final_review, source).pipe(
    Effect.mapError(({ stage, error }) => genError([{ stage, error }], succeeded)),
  )

  // The six disjoint slices together cover WordContent (STAGE_SLICES guarantees it), unprovable to TS.
  const enrichSlices = successes.map((s) => s.slice)
  return Object.assign({}, source, ...enrichSlices, review) as WordContent
})
