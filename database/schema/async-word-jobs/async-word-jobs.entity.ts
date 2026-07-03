import { createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
import { asyncWordJobsTable } from './async-word-jobs.table'
import { JOB_ERROR_TYPES } from './async-word-jobs.values'

/**
 * One stage's output — heterogeneous per stage and naturally partial, so an open record: the
 * worker decodes the relevant subshape through a concrete schema only when assembling the `words`
 * row.
 */
export const StageResultEntity = Schema.Record(Schema.String, Schema.Unknown)
export type StageResultEntity = typeof StageResultEntity.Type

/**
 * `cause` is a structured JSON-serializable snapshot (from `AiError.cause`), never a string and
 * never a live `Error`; backend-only — the FE error view surfaces `message` + `type` only.
 */
export const JobErrorEntity = Schema.Struct({
  message: Schema.String,
  type: Schema.Literals(JOB_ERROR_TYPES),
  cause: Schema.optional(Schema.Unknown),
})
export type JobErrorEntity = typeof JobErrorEntity.Type

/**
 * There is deliberately no `AsyncWordJobEntityInsert`: job rows are written only by trusted
 * worker/use-case code — no untrusted write boundary decodes (unlike `WordEntityInsert`).
 */
export const AsyncWordJobEntity = createSelectSchema(asyncWordJobsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // A bare-schema override owns its own nullability — both columns are nullable in storage.
  result: Schema.NullOr(StageResultEntity),
  error: Schema.NullOr(JobErrorEntity),
})
export type AsyncWordJobEntity = typeof AsyncWordJobEntity.Type
