import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs'
import { LocalstackContainer } from '@testcontainers/localstack'
import { ConfigProvider, Context, Data, Effect, Layer } from 'effect'
import { type QueueError, type QueueMessage, QueueService, QueueServiceLive } from './queue-service'

const IMAGE = 'localstack/localstack:4.4.0'
const REGION = 'us-east-1'
// A fresh container per file gives each test file its own isolated SQS namespace,
// so a constant queue name is unique enough — and keeps the harness deterministic
// (no clock/randomness, unlike a per-build suffix). This is the analogue of the
// per-file migrated DB in `@lexiai/database/testing`.
const QUEUE_NAME = 'lexiai-test-jobs'

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

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
 * `ConfigProvider`. `QueueServiceLive` reads only these three keys; the dev provider
 * (`ConfigProviderLive`, the `:4566` `.env`) is never in the test layer graph, so the
 * harness cannot leak to the dev LocalStack — the invariant the Postgres harness holds
 * by building its `PgClient` from the container URI, not `DatabaseUrl`.
 */
const QueueConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* QueueLocalStackContainer
    const endpoint = container.getConnectionUri()

    yield* Effect.sync(() => {
      // The AWS SDK signs every request, so it needs *some* credentials even though
      // LocalStack ignores them; `??=` leaves any real ambient creds untouched.
      process.env.AWS_ACCESS_KEY_ID ??= 'test'
      process.env.AWS_SECRET_ACCESS_KEY ??= 'test'
    })

    const queueUrl = yield* Effect.tryPromise({
      try: async () => {
        const client = new SQSClient({ region: REGION, endpoint })
        try {
          const { QueueUrl } = await client.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
          if (QueueUrl === undefined) throw new Error('CreateQueue returned no QueueUrl')
          return QueueUrl
        } finally {
          client.destroy()
        }
      },
      catch: (cause) => new ContainerError({ cause }),
    })

    // Match how production resolves these exact keys (`fromDotEnvContents`), so the
    // path-splitting semantics are identical — `fromEnv`'s `_`-trie would not.
    return ConfigProvider.layer(
      ConfigProvider.fromDotEnvContents(
        `JOBS_QUEUE_URL=${queueUrl}\nAWS_REGION=${REGION}\nAWS_ENDPOINT_URL=${endpoint}`,
      ),
    )
  }),
).pipe(Layer.provide(QueueLocalStackContainer.layer))

/**
 * Production `QueueServiceLive` pointed at a per-file LocalStack SQS container — the
 * queue analogue of `@lexiai/database/testing`'s `TestDatabaseLive`. Boots a
 * `LocalstackContainer`, provisions a queue, and supplies the production layer verbatim
 * on the container's endpoint. One container per test file:
 *
 * @example
 * ```ts
 * it.layer(QueueLocalStackLive, { timeout: '120 seconds' })((it) => {
 *   it.effect('round-trips a message', () => Effect.gen(function* () {
 *     const queue = yield* QueueService
 *     yield* queue.send('hello')
 *   }))
 * })
 * ```
 * @see `database/src/testing.ts` (the sibling pattern), `packages/queue/CLAUDE.md`
 */
export const QueueLocalStackLive = QueueServiceLive.pipe(Layer.provide(QueueConfigLive))

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
export const drainQueue: Effect.Effect<
  ReadonlyArray<QueueMessage>,
  QueueError,
  QueueService
> = Effect.gen(function* () {
  const queue = yield* QueueService
  const drained: Array<QueueMessage> = []
  while (true) {
    const batch = yield* queue.receive({ max: 10, waitSeconds: 1 })
    if (batch.length === 0) break
    drained.push(...batch)
    yield* Effect.forEach(batch, (message) => queue.delete(message.handle))
  }
  return drained
})
