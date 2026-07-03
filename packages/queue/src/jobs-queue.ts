import { JobsQueueUrl } from '@kotodama/config'
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
 * The bound wrapper business code yields — not a pass-through: the base speaks `(queueUrl, …)`,
 * this speaks `(…)`, removing a parameter by owning the which-queue binding. A second queue (a
 * DLQ) is one more wrapper over the same base.
 */
export class JobsQueue extends Context.Service<JobsQueue, JobsQueueShape>()(
  '@kotodama/queue/JobsQueue',
) {}

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
