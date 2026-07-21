import { pgEnum } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { toEnum } from '../to-enum'

/**
 * The `words.status` lifecycle vocabulary, reused as each build stage's status (`words.stages`) —
 * one tuple, so the column, the per-stage progress, the list filter, and the API union cannot
 * drift. The `as const` tuple is the single author; the literal schema, the named map, and the
 * `pgEnum` all derive from it. Name kept `async_job_status` — the enum a prior job-table design
 * introduced — to avoid a `CREATE TYPE` rename with no behavioural payoff.
 */
export const ASYNC_JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const
export const AsyncJobStatus = Schema.Literals(ASYNC_JOB_STATUSES)
export type AsyncJobStatus = typeof AsyncJobStatus.Type
export const enumAsyncJobStatus = toEnum(ASYNC_JOB_STATUSES)

export const asyncJobStatus = pgEnum('async_job_status', ASYNC_JOB_STATUSES)
