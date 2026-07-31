import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { AwsClientConfig, JobsQueueUrl } from '@kotodama/platform/config'
import { Context, Effect, Array as EffectArray, Layer, Result } from 'effect'
import { QueueError, type QueueMessage, type ReceiveOptions } from './queue-types'

export interface JobsQueueShape {
  readonly send: (body: string) => Effect.Effect<void, QueueError>
  readonly receive: (
    options?: ReceiveOptions,
  ) => Effect.Effect<ReadonlyArray<QueueMessage>, QueueError>
  readonly delete: (handle: string) => Effect.Effect<void, QueueError>
}

/**
 * The message-agnostic queue port, bound to the jobs queue at layer build — the `Layer` reads
 * `JobsQueueUrl` from config so `send`/`receive`/`delete` carry no queue argument. Bodies are opaque
 * strings; the build-message schema is owned by the enqueuer.
 */
export class JobsQueue extends Context.Service<JobsQueue, JobsQueueShape>()(
  '@kotodama/platform/queue/JobsQueue',
) {}

export const JobsQueueLive = Layer.effect(
  JobsQueue,
  Effect.gen(function* () {
    const aws = yield* AwsClientConfig
    const queueUrl = yield* JobsQueueUrl

    const client = yield* Effect.acquireRelease(
      Effect.sync(() => new SQSClient(aws)),
      (client) => Effect.sync(() => client.destroy()),
    )

    const call = <A>(run: () => Promise<A>) =>
      Effect.tryPromise({ try: run, catch: (cause) => new QueueError({ cause }) })

    // @aws-sdk/client-sqs isn't auto-instrumented (unlike @effect/sql-pg / HttpApi), so span send/delete
    // by hand — otherwise a discrete queue op is a blind spot next to its BuildWord span. `receive` is
    // deliberately NOT spanned: it's a ≤20s long-poll that runs only in the local dev loop, so a span
    // would flood the trace with idle root spans timing the wait, not real work.
    const attributes = { 'messaging.system': 'aws_sqs' }
    return {
      send: (body) =>
        call(() =>
          client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body })),
        ).pipe(Effect.asVoid, Effect.withSpan('JobsQueue.send', { attributes })),
      receive: (options) =>
        call(() =>
          client.send(
            new ReceiveMessageCommand({
              QueueUrl: queueUrl,
              MaxNumberOfMessages: options?.max ?? 1,
              WaitTimeSeconds: options?.waitSeconds ?? 0,
            }),
          ),
        ).pipe(
          Effect.map((out) =>
            EffectArray.filterMap(out.Messages ?? [], (m) =>
              m.Body !== undefined && m.ReceiptHandle !== undefined
                ? Result.succeed({ body: m.Body, handle: m.ReceiptHandle })
                : Result.failVoid,
            ),
          ),
        ),
      delete: (handle) =>
        call(() =>
          client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: handle })),
        ).pipe(Effect.asVoid, Effect.withSpan('JobsQueue.delete', { attributes })),
    }
  }),
)
