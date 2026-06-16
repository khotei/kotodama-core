import type { AsyncWordJobRow, JobError, StageResult, WordJobStage } from '@lexiai/database'
import { enumAsyncJobStatus } from '@lexiai/database'

/**
 * One stage's state for `AsyncWordJobsRepo.saveStages` — the row it names (`stage`), the `status` it
 * lands in, and the payload columns, each field typed off {@link AsyncWordJobRow} so the shape has
 * one author. Merge-patch semantics: an **absent** field leaves the stored column untouched, an
 * explicit **`null` clears it** (so a `succeeded` patch can't erase the `startedAt` its `running`
 * predecessor stamped — it simply doesn't carry the key). Author payloads through {@link stagePatch}
 * — the single owner of the status ⇄ bookkeeping pairing.
 */
export type StagePatch = {
  readonly stage: AsyncWordJobRow['stage']
  readonly status: AsyncWordJobRow['status']
  readonly result?: AsyncWordJobRow['result']
  readonly error?: AsyncWordJobRow['error']
  readonly startedAt?: AsyncWordJobRow['startedAt']
  readonly finishedAt?: AsyncWordJobRow['finishedAt']
}

/**
 * The saving rules of a stage's lifecycle — persistence vocabulary, not business logic: *when* to
 * transition is the caller's (core) decision; these author *what each status writes* — `pending`
 * is the seed/reset (every payload column explicitly cleared), `running` stamps `startedAt`, a
 * terminal status stamps `finishedAt` plus its payload.
 */
export const stagePatch = {
  pending: (stage: WordJobStage): StagePatch => ({
    stage,
    status: enumAsyncJobStatus.pending,
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  }),
  running: (stage: WordJobStage): StagePatch => ({
    stage,
    status: enumAsyncJobStatus.running,
    startedAt: new Date(),
  }),
  succeeded: (stage: WordJobStage, result: StageResult): StagePatch => ({
    stage,
    status: enumAsyncJobStatus.succeeded,
    finishedAt: new Date(),
    result,
  }),
  failed: (stage: WordJobStage, error: JobError): StagePatch => ({
    stage,
    status: enumAsyncJobStatus.failed,
    finishedAt: new Date(),
    error,
  }),
}
