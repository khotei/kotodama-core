import { ContentEngine } from '@lexiai/core-content'
import {
  type EffectDrizzleQueryError,
  enumJobErrorType,
  enumWordJobStage,
  type JobError,
  type Language,
  type StageResult,
  WORD_JOB_STAGES,
  WordEntityInsert,
  type WordJobStage,
} from '@lexiai/database'
import { AsyncWordJobsRepo, stagePatch } from '@lexiai/repositories-async-word-jobs'
import { WordsRepo } from '@lexiai/repositories-words'
import { Context, Data, Duration, Effect, Layer, Option, Schema } from 'effect'

// Internal short-circuit only: a recorded pass failure (engine error or timeout) stops the ordered run
// without surfacing as an Effect error — the failure is data in `async_word_jobs` (the state read sees it).
// Caught inside `build`, it never escapes. A failure is terminal here; recovery is a fresh build request
// (a retry resets the stages), and the backend never auto-retries.
class StageFailed extends Data.TaggedError('StageFailed')<{ readonly stage: WordJobStage }> {}

const decodeWordInsert = Schema.decodeUnknownEffect(WordEntityInsert)

/**
 * The bounded lifetime of a single pass: a pass whose `ContentEngine.produce` runs longer is
 * interrupted and the build fails with a `timed_out` {@link JobError} (AC-13). Bounded **per pass**,
 * not whole-build, so the recorded failure names the stage that hung.
 *
 * A `Reference`, so production wires nothing — the 10s default sits comfortably under the mock's
 * ~30s slow demo word; tests `Layer.succeed` a tiny budget. Real per-pass tuning arrives with the
 * real engine.
 */
export const WordBuilderStageTimeout = Context.Reference<Duration.Duration>(
  '@lexiai/core-async-word-jobs/WordBuilderStageTimeout',
  { defaultValue: () => Duration.seconds(10) },
)

/**
 * The build runner + promotion — the pass machine the worker invokes. `build` advances each
 * `wordJobStage` in declaration order, asking {@link ContentEngine} per pass; a `words` row appears
 * **only** after every pass including `final_review` succeeds, so storage never holds a half-word
 * (the pristine invariant). A pass that fails or exceeds its bounded lifetime is recorded on its stage
 * with a typed {@link JobError} and stops the run — no promotion.
 *
 * Depends solely on the `ContentEngine` `Context.Service` (the swap boundary), never a concrete engine.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export class WordBuilder extends Context.Service<
  WordBuilder,
  {
    readonly build: (
      language: Language,
      word: string,
    ) => Effect.Effect<void, EffectDrizzleQueryError>
  }
>()('@lexiai/core-async-word-jobs/WordBuilder') {}

/** The production {@link WordBuilder}; the per-pass budget reads {@link WordBuilderStageTimeout}. */
export const WordBuilderLive: Layer.Layer<
  WordBuilder,
  never,
  ContentEngine | AsyncWordJobsRepo | WordsRepo
> = Layer.effect(
  WordBuilder,
  Effect.gen(function* () {
    const stageTimeout = yield* WordBuilderStageTimeout
    const engine = yield* ContentEngine
    const jobs = yield* AsyncWordJobsRepo
    const words = yield* WordsRepo

    // The promotion: assemble the per-stage results + the build identity + provenance, and validate
    // the whole insert (every jsonb shape included) at the write boundary through `WordEntityInsert`.
    // `sourceVersions` is build provenance, not a content-pass output, so it is stamped here; the real
    // engine's model/prompt threading arrives with the real-engine milestone. A malformed assembly is
    // an impossible state for the mock — the real engine's failure handling lands later — so a decode
    // failure dies here rather than becoming a typed stage failure.
    const promote = (language: Language, word: string, slices: ReadonlyArray<StageResult>) =>
      Effect.gen(function* () {
        const insert = yield* decodeWordInsert(
          Object.assign(
            { word, language, sourceVersions: { model: 'mock', promptHash: 'mock' } },
            ...slices,
          ),
        ).pipe(Effect.orDie)
        yield* words.save(insert)
      })

    // Record a terminal pass failure (the typed JobError on the stage row) and stop the ordered run.
    // Shared by the engine-failure and timeout paths so both surface identically as Couldn't-be-made.
    const failStage = (language: Language, word: string, stage: WordJobStage, error: JobError) =>
      jobs
        .saveStages(language, word, stagePatch.failed(stage, error))
        .pipe(Effect.andThen(Effect.fail(new StageFailed({ stage }))))

    const runStage = (
      language: Language,
      word: string,
      stage: WordJobStage,
      slices: StageResult[],
    ) =>
      Effect.gen(function* () {
        yield* jobs.saveStages(language, word, stagePatch.running(stage))
        // `timeoutOption` bounds the pass and interrupts a hung produce — `None` ⇒ it exceeded the
        // budget. An engine failure (not_found / failed) propagates through it to the `catchTag`.
        const produced = yield* engine.produce(stage, language, word).pipe(
          Effect.timeoutOption(stageTimeout),
          Effect.catchTag('ContentEngineError', (error) =>
            failStage(language, word, stage, { type: error.type, message: error.message }),
          ),
        )
        const result = yield* Option.match(produced, {
          onNone: () =>
            failStage(language, word, stage, {
              type: enumJobErrorType.timed_out,
              message: `Pass '${stage}' exceeded its ${Duration.format(stageTimeout)} budget`,
            }),
          onSome: Effect.succeed,
        })
        yield* jobs.saveStages(language, word, stagePatch.succeeded(stage, result))
        slices.push(result)
        if (stage === enumWordJobStage.final_review) yield* promote(language, word, slices)
      })

    const build: WordBuilder['Service']['build'] = Effect.fnUntraced(function* (language, word) {
      // Sequential by default ⇒ passes run in declaration order and stop at the first failure (later
      // passes stay `pending`).
      const slices: StageResult[] = []
      yield* Effect.forEach(WORD_JOB_STAGES, (stage) =>
        runStage(language, word, stage, slices),
      ).pipe(Effect.catchTag('StageFailed', () => Effect.void))
    })

    return WordBuilder.of({ build })
  }),
)
