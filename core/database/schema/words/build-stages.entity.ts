import { Schema } from 'effect'
import { toEnum } from '../to-enum'
import { AsyncJobStatus } from './word-status'

/**
 * **Declaration order is the pipeline/display order** — the "being written" stepper renders
 * "Step N of 6" from it, and no query sorts by stage; reorder only to reorder the UX stepper.
 * A jsonb-nested union (it rides `words.stages`, no column backs it), so there is no `pgEnum`.
 */
export const WORD_JOB_STAGES = [
  'fetch_source',
  'enrich_etymology',
  'enrich_tiers',
  'enrich_authors',
  'enrich_visuals',
  'final_review',
] as const
export type WordJobStage = (typeof WORD_JOB_STAGES)[number]
export const enumWordJobStage = toEnum(WORD_JOB_STAGES)

/** `not_found` is a failure *type*, not a lifecycle status. jsonb-nested union, so no `pgEnum`. */
export const JOB_ERROR_TYPES = ['not_found', 'timed_out', 'failed'] as const
export type JobErrorType = (typeof JOB_ERROR_TYPES)[number]
export const enumJobErrorType = toEnum(JOB_ERROR_TYPES)

/**
 * A stage failure — `cause` is a JSON-serializable snapshot (from `AiError.cause`), never a string
 * and never a live `Error`; backend-only, the FE error view surfaces `message` + `type` only.
 */
export const JobErrorEntity = Schema.Struct({
  message: Schema.String,
  type: Schema.Literals(JOB_ERROR_TYPES),
  cause: Schema.optional(Schema.Unknown),
})
export type JobErrorEntity = typeof JobErrorEntity.Type

/** One stage's durable progress on the word — its status, plus the error iff it failed. */
export const StageEntity = Schema.Struct({
  stage: Schema.Literals(WORD_JOB_STAGES),
  status: AsyncJobStatus,
  error: Schema.optionalKey(JobErrorEntity),
})
export type StageEntity = typeof StageEntity.Type

/**
 * The per-word build progress carried on `words.stages` — one entry per pipeline stage, in
 * `WORD_JOB_STAGES` order. It replaces a per-stage table: progress lives on the aggregate it
 * describes, so a read is a single row and a transition co-writes with `words.status`.
 */
export const BuildStagesEntity = Schema.Array(StageEntity)
export type BuildStagesEntity = typeof BuildStagesEntity.Type
