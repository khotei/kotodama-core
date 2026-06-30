import type { JobErrorType, Language, SourceVersions, WordJobStage } from '@lexiai/database'
import { Context, Data, type Effect } from 'effect'
import type { StageSlice, WordGrounding } from './stage-slices'

/**
 * A pass failed to produce content. `type` is the DB's `JobErrorType` verbatim, so the worker writes
 * it straight to `async_word_jobs.error.type` — no remapping at the swap boundary. `not_found` is a
 * failure *type* (the source had no such word), not a missing-value: produce never "returns nothing".
 * `cause` is a structured, JSON-serializable snapshot (from {@link AiError.cause}), debugging-only and
 * never surfaced past the worker — never a live `Error`/provider object, since it lands in the persisted
 * `async_word_jobs.error` jsonb column and must round-trip `JSON.stringify`.
 */
export class ContentEngineError extends Data.TaggedError('ContentEngineError')<{
  readonly type: JobErrorType
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * The word-generation seam — one `produce` per `wordJobStage` pass. Consumers (the build worker)
 * depend only on this `Context.Service`, never on a concrete engine, so `MockContentEngine` and the
 * real OpenAI engine are interchangeable layers. `produce` returns the stage's **typed** {@link StageSlice}
 * (not an opaque record) — exactly the per-stage write the worker persists to `async_word_jobs.result`;
 * the six slices assemble into a `words` row. `grounding` is the sense `fetch_source` established,
 * threaded into later stages so a polysemous word stays one consistent reading ({@link WordGrounding}).
 *
 * @see `core/content/CLAUDE.md`
 */
export class ContentEngine extends Context.Service<
  ContentEngine,
  {
    readonly produce: <S extends WordJobStage>(
      stage: S,
      language: Language,
      word: string,
      grounding?: WordGrounding,
    ) => Effect.Effect<StageSlice<S>, ContentEngineError>
    /**
     * The engine's build provenance — its model + prompt-template hash + pipeline id. Stamped onto
     * `words.sourceVersions` at promotion. It is a property of the engine *identity*, not of any content
     * pass, so it lives on the service — the worker reads it once at promotion instead of the engine
     * smuggling it through a `StageResult`.
     */
    readonly sourceVersions: SourceVersions
  }
>()('@lexiai/core-content/ContentEngine') {}
