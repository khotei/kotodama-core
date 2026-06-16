import type { JobErrorType, Language, StageResult, WordJobStage } from '@lexiai/database'
import { Context, Data, type Effect } from 'effect'

/**
 * A pass failed to produce content. `type` is the DB's `JobErrorType` verbatim, so the worker writes
 * it straight to `async_word_jobs.error.type` — no remapping at the swap boundary. `not_found` is a
 * failure *type* (the source had no such word), not a missing-value: produce never "returns nothing".
 * `cause` is debugging-only and never surfaces past the worker.
 */
export class ContentEngineError extends Data.TaggedError('ContentEngineError')<{
  readonly type: JobErrorType
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * The word-generation seam — one `produce` per `wordJobStage` pass. Consumers (the build worker)
 * depend only on this `Context.Service`, never on a concrete engine, so `MockContentEngine` and the
 * real OpenAI engine are interchangeable layers. The returned `StageResult` is exactly the per-stage
 * write the worker persists to `async_word_jobs.result`; the six slices assemble into a `words` row.
 *
 * @see `core/content/CLAUDE.md`
 */
export class ContentEngine extends Context.Service<
  ContentEngine,
  {
    readonly produce: (
      stage: WordJobStage,
      language: Language,
      word: string,
    ) => Effect.Effect<StageResult, ContentEngineError>
  }
>()('@lexiai/core-content/ContentEngine') {}
