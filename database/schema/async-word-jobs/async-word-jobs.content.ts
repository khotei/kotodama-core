import { Schema } from 'effect'
import { JOB_ERROR_TYPES } from './async-word-jobs.values'

/**
 * The authored effect schemas for the `async_word_jobs` jsonb columns — the single definition of each
 * content shape. The table ({@link asyncWordJobsTable}) takes each column's `$type` from these
 * (`typeof X.Type`), and {@link AsyncWordJobEntity} overrides the same columns with these schemas so the
 * entity is fully typed rather than opaque `Json`. `core` and the API contract consume the entity
 * directly (there is no per-row model), so every job shape has exactly one author here.
 */

/**
 * One stage's output, written to `async_word_jobs.result` when the stage succeeds. Heterogeneous by
 * stage and naturally partial, so it stays an open record rather than a per-stage struct — the worker
 * decodes the relevant subshape through a concrete `effect/Schema` when it assembles the full `words`
 * row on `final_review` success.
 */
export const StageResult = Schema.Record(Schema.String, Schema.Unknown)
export type StageResult = typeof StageResult.Type

/**
 * `async_word_jobs.error` — the failure shape for a failed stage. The stage itself is a column, so it's
 * not repeated here; `type` derives from {@link JOB_ERROR_TYPES} (the tuple is the single source). `cause`
 * is a structured, JSON-serializable snapshot (a provider-error tag + message, from `AiError.cause`) —
 * **not a string** and not a live `Error` — retained (optional) for backend debugging; it never crosses
 * into core's FE-facing error view (`JobErrorView`), which surfaces only `message` + `type`.
 */
export const JobError = Schema.Struct({
  message: Schema.String,
  type: Schema.Literals(JOB_ERROR_TYPES),
  cause: Schema.optional(Schema.Unknown),
})
export type JobError = typeof JobError.Type
