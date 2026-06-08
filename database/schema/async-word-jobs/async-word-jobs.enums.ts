import { pgEnum } from 'drizzle-orm/pg-core'
import { toEnum } from '../enums'

/**
 * The word-generation pipeline, one value per `async_word_jobs` row. Declaration order is the
 * display/pipeline order — the "being written" screen renders a "Step N of 6" stepper from it (the
 * middle four are independent, so their relative order is UX-only). No query sorts by `stage`;
 * consumers that need stepper order use this declared order. A real `pgEnum` — it backs the `stage`
 * column, not a jsonb key.
 */
export const wordJobStage = pgEnum('word_job_stage', [
  'fetch_source',
  'enrich_etymology',
  'enrich_tiers',
  'enrich_authors',
  'enrich_visuals',
  'final_review',
])
export type WordJobStage = (typeof wordJobStage.enumValues)[number]
export const enumWordJobStage = toEnum(wordJobStage.enumValues)

/** `async_word_jobs.status` — the per-stage execution state. Word readiness is NOT derived from it (a `words` row exists ⇔ ready). */
export const asyncJobStatus = pgEnum('async_job_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
])
export type AsyncJobStatus = (typeof asyncJobStatus.enumValues)[number]
export const enumAsyncJobStatus = toEnum(asyncJobStatus.enumValues)
