import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { AwsClientConfig } from '@lexiai/config'
import { Context, Effect, Layer } from 'effect'
import { QueueError, type QueueMessage, type ReceiveOptions } from './queue-types'

export interface QueueClientShape {
  readonly send: (queueUrl: string, body: string) => Effect.Effect<void, QueueError>
  readonly receive: (
    queueUrl: string,
    options?: ReceiveOptions,
  ) => Effect.Effect<ReadonlyArray<QueueMessage>, QueueError>
  readonly delete: (queueUrl: string, handle: string) => Effect.Effect<void, QueueError>
}

/**
 * The parameterized base — message-agnostic, queue URL passed per call, so one client serves any
 * number of queues.
 */
export class QueueClient extends Context.Service<QueueClient, QueueClientShape>()(
  '@lexiai/queue/QueueClient',
) {}

export const QueueClientLive = Layer.effect(
  QueueClient,
  Effect.gen(function* () {
    const aws = yield* AwsClientConfig

    const client = yield* Effect.acquireRelease(
      Effect.sync(() => new SQSClient(aws)),
      (client) => Effect.sync(() => client.destroy()),
    )

    const call = <A>(run: () => Promise<A>) =>
      Effect.tryPromise({ try: run, catch: (cause) => new QueueError({ cause }) })

    return {
      send: (queueUrl, body) =>
        call(() =>
          client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body })),
        ).pipe(Effect.asVoid),
      receive: (queueUrl, options) =>
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
            (out.Messages ?? []).flatMap((m) =>
              m.Body !== undefined && m.ReceiptHandle !== undefined
                ? [{ body: m.Body, handle: m.ReceiptHandle }]
                : [],
            ),
          ),
        ),
      delete: (queueUrl, handle) =>
        call(() =>
          client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: handle })),
        ).pipe(Effect.asVoid),
    }
  }),
)
