import { Schema } from 'effect'
import { AsyncJobStatus } from '../primitives/async-job-status'
import { toEnum } from '../utils/to-enum'

/**
 * **Declaration order is the pipeline/display order** — the "being written" stepper renders
 * "Step N of 6" from it, and no query sorts by stage; reorder only to reorder the UX stepper.
 * A jsonb-nested union (it rides `words.stages`, no column backs it), so there is no `pgEnum`.
 */
export const WORD_BUILD_STAGES = [
  'fetch_source',
  'enrich_etymology',
  'enrich_tiers',
  'enrich_authors',
  'enrich_visuals',
  'final_review',
] as const

export type WordBuildStage = (typeof WORD_BUILD_STAGES)[number]

export const enumWordBuildStage = toEnum(WORD_BUILD_STAGES)

/** `not_found` is a failure *type*, not a lifecycle status. jsonb-nested union, so no `pgEnum`. */
export const WORD_BUILD_ERROR_TYPES = ['not_found', 'timed_out', 'failed'] as const

export type WordBuildErrorType = (typeof WORD_BUILD_ERROR_TYPES)[number]

export const enumWordBuildErrorType = toEnum(WORD_BUILD_ERROR_TYPES)

/**
 * A stage failure — `cause` is a JSON-serializable snapshot (from `AiError.cause`), never a string
 * and never a live `Error`; backend-only, the FE error view surfaces `message` + `type` only.
 */
export const WordBuildErrorEntity = Schema.Struct({
  message: Schema.String,
  type: Schema.Literals(WORD_BUILD_ERROR_TYPES),
  cause: Schema.optional(Schema.Unknown),
})
export type WordBuildErrorEntity = typeof WordBuildErrorEntity.Type

/** One stage's durable progress on the word — its status, plus the error iff it failed. */
export const WordBuildStageEntity = Schema.Struct({
  stage: Schema.Literals(WORD_BUILD_STAGES),
  status: AsyncJobStatus,
  error: Schema.optionalKey(WordBuildErrorEntity),
})
export type WordBuildStageEntity = typeof WordBuildStageEntity.Type

/**
 * The per-word build progress carried on `words.stages` — one entry per pipeline stage, in
 * `WORD_BUILD_STAGES` order. It replaces a per-stage table: progress lives on the aggregate it
 * describes, so a read is a single row and a transition co-writes with `words.status`.
 */
export const WordBuildStagesEntity = Schema.Array(WordBuildStageEntity)
export type WordBuildStagesEntity = typeof WordBuildStagesEntity.Type
