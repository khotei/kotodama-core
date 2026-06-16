import { toEnum } from '../to-enum'

/**
 * The build-machinery value lists. Each `as const` tuple is the single authored definition; the
 * pgEnums (`async-word-jobs.enums.ts`) derive from it, and the entity's column schemas from those — so
 * core's contract validates `stage`/`status` through the entity (`StageProgress`), not a separate mirror.
 */

/**
 * The word-generation pipeline. **Declaration order is the display/pipeline order** — the "being
 * written" screen renders a "Step N of 6" stepper from it (the middle four are independent, so
 * their relative order is UX-only); reorder only when reordering the UX stepper. No query sorts by
 * `stage`; consumers that need stepper order use this declared order.
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

/** One stage's execution state. Word readiness is NOT derived from it (a `words` row exists ⇔ ready). */
export const ASYNC_JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const
export type AsyncJobStatus = (typeof ASYNC_JOB_STATUSES)[number]
export const enumAsyncJobStatus = toEnum(ASYNC_JOB_STATUSES)

/**
 * Closed union for `JobError.type` — a jsonb-nested union, NOT a `pgEnum` (no column backs it, so
 * no `CREATE TYPE` and no migration). Drives the UI's recovery action: `not_found` ⇒ "couldn't
 * find this word", `timed_out` ⇒ taking-too-long retry, `failed` ⇒ generic retry — so "couldn't
 * find this word" is a failure type, not a fifth lookup state.
 */
export const JOB_ERROR_TYPES = ['not_found', 'timed_out', 'failed'] as const
export type JobErrorType = (typeof JOB_ERROR_TYPES)[number]
export const enumJobErrorType = toEnum(JOB_ERROR_TYPES)
