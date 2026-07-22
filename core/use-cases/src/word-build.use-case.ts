import { selectWord, upsertWord } from '@kotodama/core/repositories'
import { createWord, stagesAll } from '@kotodama/core/words'
import {
  type BuildStagesEntity,
  enumAsyncJobStatus,
  enumJobErrorType,
  type Language,
  WORD_JOB_STAGES,
} from '@kotodama/database'
import { Effect, Option } from 'effect'

// A terminally-failed build's write, in one place: log, then flip the row `failed` with its final
// stage picture — one write, since stages ride the row. Both domain outcomes (timeout, generation
// failure) differ only in their log line and stage set, so each catch builds that descriptor.
const recordWordFailure = Effect.fnUntraced(function* (
  language: Language,
  word: string,
  outcome: { logLine: string; stages: BuildStagesEntity },
) {
  yield* Effect.logError(outcome.logLine)
  yield* upsertWord(language, word, { status: enumAsyncJobStatus.failed, stages: outcome.stages })
})

/**
 * The worker flow: manages the `words` row's status lifecycle and its inline `stages` around
 * `createWord` (which owns the content promote AND writes its all-succeeded stages in the same
 * write). No live per-stage tracking, no resume — the row + whole pipeline flip `running` before
 * generation, and the outcome lands in one write at the end. A committed word is never marked
 * `timed_out`: the generation budget (a decorator at the worker entrypoint) bounds generation only,
 * and `createWord` commits after that race resolves.
 */
export const buildWord = Effect.fnUntraced(function* (language: Language, word: string) {
  // Poison-message gate: a conforming message names a row `requestWordBuild` seeded, so an absent
  // row is a defect — die before any write (the upsert below is total and would fabricate a list
  // entry no one requested).
  if (Option.isNone(yield* selectWord(language, word)))
    return yield* Effect.die(
      new Error(`buildWord: no words row for "${word}" (${language}) — build was never requested`),
    )

  // Flip row + whole pipeline `running` before generation, so an in-flight word reads its true
  // status (list/search read the `words` row directly). A failure here is pre-commit — propagates
  // for a redrive.
  yield* upsertWord(language, word, {
    status: enumAsyncJobStatus.running,
    stages: stagesAll(enumAsyncJobStatus.running),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError(`failed to mark build running for "${word}" (${language})`, error),
    ),
  )

  // `createWord` commits content + `succeeded` + all-succeeded stages in one write, so there is no
  // separate journal to reconcile after the commit.
  yield* createWord(language, word).pipe(
    Effect.catchTags({
      // Budget overrun: nothing was committed — every stage `timed_out`, the row `failed` (content
      // stays NULL; `failed` is buildable, so a re-request retries).
      TimeoutError: () => {
        const message = 'generation exceeded its build budget'
        return recordWordFailure(language, word, {
          logLine: `word build timed out for "${word}" (${language}): ${message}`,
          stages: WORD_JOB_STAGES.map((stage) => ({
            stage,
            status: enumAsyncJobStatus.failed,
            error: { type: enumJobErrorType.timed_out, message },
          })),
        })
      },
      // The expected domain outcome — record the full per-stage picture and succeed, so it never
      // reaches the worker edge.
      WordGenerationError: ({ failures, succeeded }) => {
        // Passes that neither succeeded nor failed never completed — reset to `pending` (undoing the
        // `running` flip), so a dead build leaves no stage stuck `running`.
        const ran = new Set([...succeeded, ...failures.map(({ stage }) => stage)])
        return recordWordFailure(language, word, {
          logLine: `word build failed for "${word}" (${language}): ${failures
            .map(({ stage, error }) => `${stage} (${error.type})`)
            .join(', ')}`,
          stages: [
            ...succeeded.map((stage) => ({ stage, status: enumAsyncJobStatus.succeeded })),
            ...failures.map(({ stage, error }) => ({
              stage,
              status: enumAsyncJobStatus.failed,
              error,
            })),
            ...WORD_JOB_STAGES.filter((stage) => !ran.has(stage)).map((stage) => ({
              stage,
              status: enumAsyncJobStatus.pending,
            })),
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
