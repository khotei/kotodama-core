import { JobsQueueUrl } from '@lexiai/config'
import { Context, Effect, Layer } from 'effect'
import { QueueClient } from './queue-client'
import type { QueueError, QueueMessage, ReceiveOptions } from './queue-types'

export interface JobsQueueShape {
  readonly send: (body: string) => Effect.Effect<void, QueueError>
  readonly receive: (
    options?: ReceiveOptions,
  ) => Effect.Effect<ReadonlyArray<QueueMessage>, QueueError>
  readonly delete: (handle: string) => Effect.Effect<void, QueueError>
}

/**
 * The bound queue for today's single queue: the resource-free port business code yields. Fixes
 * `awsResources.jobsQueue` → `JOBS_QUEUE_URL` (the existing {@link JobsQueueUrl} config) and exposes
 * `send(body)` / `receive(opts?)` / `delete(handle)`, each delegating to {@link QueueClient} with that
 * URL — so the enqueuer ({@link import('@lexiai/use-cases').requestWordBuild}) and the worker consume
 * loop never learn the queue parameter.
 *
 * It is **not** a deep-modules §5 pass-through: the base speaks `(queueUrl, …)`, this speaks `(…)` —
 * it removes a parameter by owning the *which-queue* binding. A second queue later (a DLQ) is one more
 * such wrapper over the same base, with no base change.
 *
 * @see `packages/queue/CLAUDE.md`
 */
export class JobsQueue extends Context.Service<JobsQueue, JobsQueueShape>()(
  '@lexiai/queue/JobsQueue',
) {}

/**
 * {@link JobsQueue} over {@link QueueClient}: binds `JOBS_QUEUE_URL` at layer build and delegates every
 * op to the base with that URL. Requires `QueueClient` (provide `QueueClientLive` beneath it) and
 * carries a `ConfigError` for `JobsQueueUrl` — closed by the entrypoint's `ConfigProviderLive`.
 *
 * @see `.claude/rules/config.md`
 */
export const JobsQueueLive = Layer.effect(
  JobsQueue,
  Effect.gen(function* () {
    const client = yield* QueueClient
    const url = yield* JobsQueueUrl

    return {
      send: (body) => client.send(url, body),
      receive: (options) => client.receive(url, options),
      delete: (handle) => client.delete(url, handle),
    }
  }),
)
