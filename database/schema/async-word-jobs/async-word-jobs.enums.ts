import { pgEnum } from 'drizzle-orm/pg-core'
import { ASYNC_JOB_STATUSES, WORD_JOB_STAGES } from './async-word-jobs.values'

/** `async_word_jobs.stage` — one value per pipeline pass; values derive from {@link WORD_JOB_STAGES}. */
export const wordJobStage = pgEnum('word_job_stage', WORD_JOB_STAGES)

/** `async_word_jobs.status` — the per-stage execution state; values derive from {@link ASYNC_JOB_STATUSES}. */
export const asyncJobStatus = pgEnum('async_job_status', ASYNC_JOB_STATUSES)
