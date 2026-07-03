import { Schema } from 'effect'
import { toEnum } from '../to-enum'

/**
 * **Declaration order is the pipeline/display order** — the "being written" stepper renders
 * "Step N of 6" from it, and no query sorts by `stage`; reorder only to reorder the UX stepper.
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

/**
 * Also the `words.status` word-level vocabulary — reused, never a separate `ready|creating|…`
 * tuple, so the column, the list filter, and the API union cannot drift.
 */
export const ASYNC_JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const
export const AsyncJobStatus = Schema.Literals(ASYNC_JOB_STATUSES)
export type AsyncJobStatus = typeof AsyncJobStatus.Type
export const enumAsyncJobStatus = toEnum(ASYNC_JOB_STATUSES)

/**
 * A jsonb-nested union — deliberately NO `pgEnum` (no column backs it, a `CREATE TYPE` would back
 * nothing). `not_found` is a failure *type*, not a fifth lookup status.
 */
export const JOB_ERROR_TYPES = ['not_found', 'timed_out', 'failed'] as const
export type JobErrorType = (typeof JOB_ERROR_TYPES)[number]
export const enumJobErrorType = toEnum(JOB_ERROR_TYPES)
