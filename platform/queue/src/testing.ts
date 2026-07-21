import { SQSClient } from '@aws-sdk/client-sqs'
import { awsResources } from '@kotodama/platform/config'
import { LocalstackContainer } from '@testcontainers/localstack'
import { ConfigProvider, Context, Data, Effect, Layer } from 'effect'
import { ensureQueue } from './ensure-queue'
import { JobsQueue, JobsQueueLive } from './jobs-queue'
import { QueueClientLive } from './queue-client'
import type { QueueMessage } from './queue-types'

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

const IMAGE = 'localstack/localstack:4.4.0'
const REGION = 'us-east-1'
// Reusing the inventory name across files is collision-free — isolation is the per-file
// container, not a distinct name.
const QUEUE_NAME = awsResources.jobsQueue.name

// LocalStack signs every request even though it ignores the credentials, so the SDK still needs some.
const sqs = (endpoint: string) =>
  new SQSClient({
    region: REGION,
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  })

class QueueLocalStackContainer extends Context.Service<QueueLocalStackContainer>()(
  '@kotodama/platform/queue/testing/QueueLocalStackContainer',
  {
    // Unlike `PgContainer`, no `withWaitStrategy` override: the module default is log-based, not
    // the exec probe that hangs on Docker Desktop/macOS.
    make: Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new LocalstackContainer(IMAGE)
            .withEnvironment({ SERVICES: 'sqs', EAGER_SERVICE_LOADING: '1', DEBUG: '0' })
            .start(),
        catch: (cause) => new ContainerError({ cause }),
      }),
      (container) => Effect.promise(() => container.stop()),
    ),
  },
) {
  static readonly layer = Layer.effect(this)(this.make)
}

/**
 * A **replacement** ConfigProvider built from the running container — `ConfigProviderLive` (the
 * dev `.env`) is never in the test layer graph, so the harness structurally cannot leak to the
 * dev LocalStack.
 */
const QueueConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* QueueLocalStackContainer
    const endpoint = container.getConnectionUri()

    const queueUrl = yield* withSqs((client) => ensureQueue(client, QUEUE_NAME)).pipe(
      Effect.mapError((cause) => new ContainerError({ cause })),
    )

    // `fromDotEnvContents` matches production's path-splitting semantics — `fromEnv`'s `_`-trie
    // would not. Credentials ride this provider too: no runtime `process.env` mutation.
    return ConfigProvider.layer(
      ConfigProvider.fromDotEnvContents(
        [
          `JOBS_QUEUE_URL=${queueUrl}`,
          `AWS_REGION=${REGION}`,
          `AWS_ENDPOINT_URL=${endpoint}`,
          'AWS_ACCESS_KEY_ID=test',
          'AWS_SECRET_ACCESS_KEY=test',
        ].join('\n'),
      ),
    )
  }),
).pipe(Layer.provide(QueueLocalStackContainer.layer))

/**
 * The production base+wrapper split verbatim, on a per-file LocalStack container — the queue
 * analogue of `TestDatabaseLive`. One container per test file via
 * `it.layer(QueueLocalStackLive, { timeout: '120 seconds' })`.
 */
export const QueueLocalStackLive = JobsQueueLive.pipe(
  Layer.provide(QueueClientLive),
  Layer.provide(QueueConfigLive),
  Layer.provideMerge(QueueLocalStackContainer.layer),
)

// For the base's own adapter-contract test, which drives ops with an explicit queue URL rather
// than the bound one.
export const QueueClientLocalStackLive = QueueClientLive.pipe(
  Layer.provide(QueueConfigLive),
  Layer.provideMerge(QueueLocalStackContainer.layer),
)

/** A short-lived harness SDK client (distinct from the `QueueClientLive` under test) for raw SQS primitives. */
export const withSqs = <A, E>(use: (client: SQSClient) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const container = yield* QueueLocalStackContainer
    const client = sqs(container.getConnectionUri())
    return yield* use(client).pipe(Effect.ensuring(Effect.sync(() => client.destroy())))
  })

/**
 * Receive-and-delete every visible message (SQS caps a receive at 10 and may return fewer, so loop
 * until an empty poll). Deleting as it drains stops a message reappearing after its visibility
 * timeout — both the per-test purge (call at the top of each test, like `resetDb`) and the "what
 * got enqueued?" assertion source.
 */
export const drainQueue = Effect.gen(function* () {
  const queue = yield* JobsQueue
  const drained: Array<QueueMessage> = []
  while (true) {
    const batch = yield* queue.receive({ max: 10, waitSeconds: 0 })
    if (batch.length === 0) break
    drained.push(...batch)
    yield* Effect.forEach(batch, (message) => queue.delete(message.handle))
  }
  return drained
})
