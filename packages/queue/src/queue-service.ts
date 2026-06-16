import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { AwsEndpoint, AwsRegion, JobsQueueUrl } from '@lexiai/config'
import { Context, Data, Effect, Layer, Option } from 'effect'

/**
 * A message pulled off the queue: its raw `body` plus the `handle` used to ack it
 * via {@link QueueService.delete}. The body is opaque to this layer — the
 * build-message schema is owned by the enqueuer.
 */
export interface QueueMessage {
  readonly body: string
  readonly handle: string
}

/** Tuning for a single {@link QueueService.receive} poll; both fields map to SQS knobs. */
export interface ReceiveOptions {
  /** Max messages to return in one poll (SQS caps at 10). Default 1. */
  readonly max?: number
  /** Long-poll wait, seconds (SQS caps at 20). Default 0 (short poll). */
  readonly waitSeconds?: number
}

export interface QueueServiceShape {
  readonly send: (body: string) => Effect.Effect<void, QueueError>
  readonly receive: (
    options?: ReceiveOptions,
  ) => Effect.Effect<ReadonlyArray<QueueMessage>, QueueError>
  readonly delete: (handle: string) => Effect.Effect<void, QueueError>
}

/** The underlying queue transport rejected (e.g. the SQS API errored or is unreachable). */
export class QueueError extends Data.TaggedError('QueueError')<{ cause: unknown }> {}

/**
 * Message-agnostic queue port: enqueue a string `body`, poll for messages, and ack a
 * handled one. Implemented by {@link QueueServiceLive} (real SQS); tests run that same
 * layer over a per-file LocalStack container (`@lexiai/queue/testing`).
 *
 * @see `packages/queue/CLAUDE.md`
 */
export class QueueService extends Context.Service<QueueService, QueueServiceShape>()(
  '@lexiai/queue/QueueService',
) {}

/**
 * `QueueService` over `@aws-sdk/client-sqs`, configured through `@lexiai/config`
 * (never raw `process.env`). Honors an optional `AWS_ENDPOINT_URL` so it targets
 * LocalStack locally and the resolved AWS endpoint in prod. The client is owned by
 * the layer scope and `destroy()`ed on release.
 *
 * @see `.claude/rules/config.md`
 */
export const QueueServiceLive = Layer.effect(
  QueueService,
  Effect.gen(function* () {
    const queueUrl = yield* JobsQueueUrl
    const region = yield* AwsRegion
    const endpoint = yield* AwsEndpoint

    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new SQSClient({
            region,
            ...(Option.isSome(endpoint) ? { endpoint: endpoint.value } : {}),
          }),
      ),
      (client) => Effect.sync(() => client.destroy()),
    )

    const call = <A>(run: () => Promise<A>): Effect.Effect<A, QueueError> =>
      Effect.tryPromise({ try: run, catch: (cause) => new QueueError({ cause }) })

    return {
      send: (body) =>
        call(() =>
          client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body })),
        ).pipe(Effect.asVoid),
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
            (out.Messages ?? []).flatMap((m) =>
              m.Body !== undefined && m.ReceiptHandle !== undefined
                ? [{ body: m.Body, handle: m.ReceiptHandle }]
                : [],
            ),
          ),
        ),
      delete: (handle) =>
        call(() =>
          client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: handle })),
        ).pipe(Effect.asVoid),
    }
  }),
)
