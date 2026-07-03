import type { JobErrorEntity, StageResultEntity, WordJobStage } from '@lexiai/database'
import { enumAsyncJobStatus } from '@lexiai/database'
import type { AsyncWordJobUpsert } from './async-word-jobs.repo'

/**
 * The saving rules of a stage's lifecycle — persistence vocabulary, not business logic: *when* to
 * transition is the caller's (core) decision; these author *what each status writes* — `pending`
 * is the seed/reset (every payload column explicitly cleared), `running` stamps `startedAt`, a
 * terminal status stamps `finishedAt` plus its payload.
 */
export const stagePatch = {
  pending: (stage: WordJobStage): AsyncWordJobUpsert => ({
    stage,
    status: enumAsyncJobStatus.pending,
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  }),
  running: (stage: WordJobStage): AsyncWordJobUpsert => ({
    stage,
    status: enumAsyncJobStatus.running,
    startedAt: new Date(),
  }),
  succeeded: (stage: WordJobStage, result: StageResultEntity): AsyncWordJobUpsert => ({
    stage,
    status: enumAsyncJobStatus.succeeded,
    finishedAt: new Date(),
    result,
  }),
  failed: (stage: WordJobStage, error: JobErrorEntity): AsyncWordJobUpsert => ({
    stage,
    status: enumAsyncJobStatus.failed,
    finishedAt: new Date(),
    error,
  }),
}
