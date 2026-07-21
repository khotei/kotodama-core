import { createWord } from '@kotodama/core-words'
import {
  enumAsyncJobStatus,
  enumJobErrorType,
  type Language,
  WORD_JOB_STAGES,
} from '@kotodama/database'
import {
  type AsyncWordJobUpsert,
  stagePatch,
  upsertWordJobStages,
} from '@kotodama/repositories-async-word-jobs'
import { selectWord, upsertWord } from '@kotodama/repositories-words'
import { Effect, Option } from 'effect'

// A terminally-failed build's write, in one place: log, batch the stage journal, flip the row
// `failed`. Both domain outcomes (timeout, generation failure) differ only in their log line and
// stage set, so each catch builds that descriptor and this owns the identical persistence tail.
const recordWordFailure = Effect.fnUntraced(function* (
  language: Language,
  word: string,
  outcome: { logLine: string; stages: AsyncWordJobUpsert[] },
) {
  yield* Effect.logError(outcome.logLine)
  yield* upsertWordJobStages(language, word, outcome.stages)
  yield* upsertWord(language, word, { status: enumAsyncJobStatus.failed })
})

/**
 * The worker flow: manages the job journal and the `words` row's status lifecycle around
 * `createWord` (which owns the content promote). No live per-stage tracking, no resume — the row +
 * whole pipeline flip `running` in one batch before generation, and the outcome lands in one batch
 * at the end. A committed word is never journalled `timed_out`: the generation budget (a decorator
 * at the worker entrypoint) bounds generation only, and `createWord` commits after that race
 * resolves.
 */
export const buildWord = Effect.fnUntraced(function* (language: Language, word: string) {
  // Poison-message gate: a conforming message names a row `requestWordBuild` seeded, so an absent
  // row is a defect — die before any write (the upserts below are total and would fabricate a list
  // entry no one requested).
  if (Option.isNone(yield* selectWord(language, word)))
    return yield* Effect.die(
      new Error(`buildWord: no words row for "${word}" (${language}) — build was never requested`),
    )

  // Flip row + whole pipeline `running` before generation, so an in-flight word reads its true
  // status (list/search read the `words` row directly). A failure here is pre-commit — propagates
  // for a redrive.
  yield* Effect.andThen(
    upsertWord(language, word, { status: enumAsyncJobStatus.running }),
    upsertWordJobStages(language, word, WORD_JOB_STAGES.map(stagePatch.running)),
  ).pipe(
    Effect.tapError((error) =>
      Effect.logError(`failed to mark build running for "${word}" (${language})`, error),
    ),
  )

  yield* createWord(language, word).pipe(
    // A journal-write error AFTER the commit is swallowed: the word is ready, and a redrive would
    // wrongly regenerate it. A commit-path error propagates (no row written — the edge redrives).
    Effect.andThen(
      upsertWordJobStages(
        language,
        word,
        WORD_JOB_STAGES.map((stage) => stagePatch.succeeded(stage, {})),
      ).pipe(
        Effect.catchTag('EffectDrizzleQueryError', (error) =>
          Effect.logError(
            `word committed but its stage journal write failed for "${word}" (${language})`,
            error,
          ),
        ),
      ),
    ),
    Effect.catchTags({
      // Budget overrun: nothing was committed — every stage `timed_out`, the row `failed` (content
      // stays NULL; `failed` is buildable, so a re-request retries).
      TimeoutError: () => {
        const message = 'generation exceeded its build budget'
        return recordWordFailure(language, word, {
          logLine: `word build timed out for "${word}" (${language}): ${message}`,
          stages: WORD_JOB_STAGES.map((stage) =>
            stagePatch.failed(stage, { type: enumJobErrorType.timed_out, message }),
          ),
        })
      },
      // The expected domain outcome — record the full per-stage picture and succeed, so it never
      // reaches the worker edge.
      WordGenerationError: ({ failures, succeeded }) => {
        // Passes that neither succeeded nor failed never completed — reset to `pending` (undoing
        // the `running` flip), so a dead build leaves no stage stuck `running`.
        const ran = new Set([...succeeded, ...failures.map(({ stage }) => stage)])
        return recordWordFailure(language, word, {
          logLine: `word build failed for "${word}" (${language}): ${failures
            .map(({ stage, error }) => `${stage} (${error.type})`)
            .join(', ')}`,
          stages: [
            ...succeeded.map((stage) => stagePatch.succeeded(stage, {})),
            ...failures.map(({ stage, error }) => stagePatch.failed(stage, error)),
            ...WORD_JOB_STAGES.filter((stage) => !ran.has(stage)).map(stagePatch.pending),
          ],
        })
      },
    }),
    // What remains is an infra fault — log before it leaves for the redrive, so a redrive is never
    // silent.
    Effect.tapError((error) =>
      Effect.logError(`word build errored for "${word}" (${language})`, error),
    ),
  )
})
