import { SQSClient } from '@aws-sdk/client-sqs'
import { awsResources } from '@lexiai/config'
import { LocalstackContainer } from '@testcontainers/localstack'
import { ConfigProvider, Context, Data, Effect, Layer } from 'effect'
import { ensureQueue } from './ensure-queue'
import { JobsQueue, JobsQueueLive } from './jobs-queue'
import { QueueClientLive } from './queue-client'
import type { QueueMessage } from './queue-types'

const IMAGE = 'localstack/localstack:4.4.0'
const REGION = 'us-east-1'
// The queue name comes from the single AWS-resource inventory (`@lexiai/config`), the same source
// `local:provision` + the future Pulumi stack read — so the name lives in exactly one place. A fresh
// container per file gives each test file its own isolated SQS namespace, so reusing the inventory
// name across files is collision-free (isolation is per-file *container*, not a distinct name) and
// keeps the harness deterministic. Analogue of the per-file migrated DB in `@lexiai/database/testing`.
const QUEUE_NAME = awsResources.jobsQueue.name

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

// LocalStack signs every request even though it ignores the credentials, so the SDK still needs some.
const sqs = (endpoint: string) =>
  new SQSClient({
    region: REGION,
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  })

class QueueLocalStackContainer extends Context.Service<QueueLocalStackContainer>()(
  '@lexiai/queue/testing/QueueLocalStackContainer',
  {
    // The module default wait strategy is `Wait.forLogMessage("Ready")`, NOT the
    // `forListeningPorts` exec probe that hangs on Docker Desktop/macOS — so, unlike
    // `PgContainer`, no `withWaitStrategy` override is needed. Env keeps the boot lean and fast:
    // `SERVICES=sqs` (only SQS, not the dev compose's `sqs,s3`), `EAGER_SERVICE_LOADING` inits SQS
    // at boot so the first request isn't slow, `DEBUG=0` quiets the logs.
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
 * Resolves the `@lexiai/config` AWS seam (`JOBS_QUEUE_URL` / `AWS_REGION` /
 * `AWS_ENDPOINT_URL`) from the running container as a **replacement**
 * `ConfigProvider`. `QueueClientLive` (the base) reads the region/endpoint/creds, and
 * `JobsQueueLive` (the wrapper) binds `JOBS_QUEUE_URL`; the dev provider
 * (`ConfigProviderLive`, the `:4566` `.env`) is never in the test layer graph, so the
 * harness cannot leak to the dev LocalStack — the invariant the Postgres harness holds
 * by building its `PgClient` from the container URI, not `DatabaseUrl`.
 */
const QueueConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* QueueLocalStackContainer
    const endpoint = container.getConnectionUri()

    // Provision the isolated test queue through the shared create-if-absent primitive, against the
    // container client — `ensureQueue` returns the URL the replacement provider below resolves. Its
    // `QueueError` is remapped to the harness's `ContainerError` so this seam's failure surface is
    // unchanged.
    const queueUrl = yield* withSqs((client) => ensureQueue(client, QUEUE_NAME)).pipe(
      Effect.mapError((cause) => new ContainerError({ cause })),
    )

    // Match how production resolves these exact keys (`fromDotEnvContents`), so the path-splitting
    // semantics are identical — `fromEnv`'s `_`-trie would not. `QueueClientLive` reads credentials
    // from `AwsClientConfig`, so they go through this provider too (no runtime `process.env` mutation).
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
 * The bound {@link JobsQueueLive} over `QueueClientLive`, pointed at a per-file LocalStack SQS
 * container — the queue analogue of `@lexiai/database/testing`'s `TestDatabaseLive`. Boots a
 * `LocalstackContainer`, provisions a queue, and supplies the production base+wrapper split verbatim
 * on the container's endpoint (the wrapper binds the container's `JOBS_QUEUE_URL`). One container per
 * test file:
 *
 * @example
 * ```ts
 * it.layer(QueueLocalStackLive, { timeout: '120 seconds' })((it) => {
 *   it.effect('round-trips a message', () => Effect.gen(function* () {
 *     const queue = yield* JobsQueue
 *     yield* queue.send('hello')
 *   }))
 * })
 * ```
 * @see `database/src/testing.ts` (the sibling pattern), `packages/queue/CLAUDE.md`
 */
export const QueueLocalStackLive = JobsQueueLive.pipe(
  Layer.provide(QueueClientLive),
  Layer.provide(QueueConfigLive),
  Layer.provideMerge(QueueLocalStackContainer.layer),
)

/**
 * The parameterized {@link QueueClientLive} over the same per-file LocalStack container as
 * {@link QueueLocalStackLive} — used by the `QueueClient` adapter-contract test, which drives
 * `send`/`receive`/`delete` with an **explicit** queue URL (obtained via {@link withSqs} +
 * {@link ensureQueue}) rather than the bound URL {@link JobsQueue} carries. Reads the same
 * `AwsClientConfig` seam, so it provisions no queue of its own.
 */
export const QueueClientLocalStackLive = QueueClientLive.pipe(
  Layer.provide(QueueConfigLive),
  Layer.provideMerge(QueueLocalStackContainer.layer),
)

/**
 * Run one SQS op against the running container with a short-lived SDK client (the harness's own
 * client, distinct from the `QueueClientLive` under test), destroying it on settle. The seam a test
 * uses to drive raw SQS primitives like {@link ensureQueue} at the {@link QueueLocalStackLive} layer —
 * the queue analogue of `@lexiai/storage/testing`'s `withS3`.
 */
export const withSqs = <A, E>(use: (client: SQSClient) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const container = yield* QueueLocalStackContainer
    const client = sqs(container.getConnectionUri())
    return yield* use(client).pipe(Effect.ensuring(Effect.sync(() => client.destroy())))
  })

/**
 * Receive-and-delete every currently-visible message, returning them in receive order. SQS caps a
 * single receive at 10 and may return fewer than are available, so this loops until a poll comes back
 * empty; `waitSeconds: 1` makes that empty poll a reliable end-of-queue signal on single-node
 * LocalStack. Deleting as it drains means a message can't reappear after its visibility timeout to
 * pollute a later test — so this doubles as both the per-test purge (call at the top of each test, the
 * SQS analogue of `resetDb`) and the "what got enqueued?" assertion source for queue-inspecting tests.
 *
 * @see `database/src/testing.ts`'s `resetDb` (the per-test DB reset this mirrors)
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
