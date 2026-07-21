import type { JobErrorType, Language, SourceVersionsEntity, WordJobStage } from '@kotodama/database'
import { Context, Data, type Effect } from 'effect'
import type { StageSlice, WordGrounding } from './stage-slices'

/**
 * `type` is the DB's `JobErrorType` verbatim — the worker writes it straight to
 * `async_word_jobs.error.type`, no remapping at the swap boundary. `cause` must stay a
 * JSON-serializable snapshot (it lands in the persisted jsonb column), never a live provider object.
 */
export class ContentEngineError extends Data.TaggedError('ContentEngineError')<{
  readonly type: JobErrorType
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * The word-generation swap seam — consumers depend on this tag only, so the mock and the real
 * OpenAI engine are interchangeable layers. `produce` returns the stage's typed {@link StageSlice};
 * `grounding` threads `fetch_source`'s sense into later stages ({@link WordGrounding}).
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
     * Build provenance is engine *identity*, not a content pass — it lives on the service so it is
     * never smuggled through a stage's produced slice.
     */
    readonly sourceVersions: SourceVersionsEntity
  }
>()('@kotodama/core-content/ContentEngine') {}
