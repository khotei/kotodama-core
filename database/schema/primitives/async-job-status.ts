import { pgEnum } from 'drizzle-orm/pg-core'
import { Record as EffectRecord, Schema } from 'effect'
import { toEnum } from '../utils/to-enum'

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

/**
 * A record with a value per `AsyncJobStatus`, each computed by `fn` — the parametric counterpart of
 * {@link enumAsyncJobStatus} (which fixes each value to its own key). Mapping over that exact
 * key-map preserves the key type, so the result is `Record<AsyncJobStatus, V>` with no cast: one
 * author for "a bucket per status", and a new status grows every such record by construction.
 */
export function byAsyncJobStatus<V>(fn: (status: AsyncJobStatus) => V): Record<AsyncJobStatus, V> {
  return EffectRecord.map(enumAsyncJobStatus, fn)
}
