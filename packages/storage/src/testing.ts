import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { awsResources } from '@lexiai/config'
import { LocalstackContainer } from '@testcontainers/localstack'
import { ConfigProvider, Context, Data, Effect, Layer } from 'effect'
import { ImagesStore, ImagesStoreLive } from './images-store'
import { ensureBucket } from './provisioning'
import { StorageClientLive } from './storage-client'

const IMAGE = 'localstack/localstack:4.4.0'
const REGION = 'us-east-1'
// The bucket name comes from the single AWS-resource inventory (`@lexiai/config`), the same source
// `local:provision` + the future Pulumi stack read — so the name lives in exactly one place. A fresh
// container per file gives each test file its own isolated S3 namespace, so reusing the inventory name
// across files is collision-free (isolation is per-file *container*, not a distinct name). Analogue of
// the per-file migrated DB in `@lexiai/database/testing` and the per-file queue in `@lexiai/queue/testing`.
const BUCKET = awsResources.imagesBucket.name

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

// LocalStack on a custom (non-AWS) endpoint must be addressed path-style, and the SDK signs every
// request even though LocalStack ignores the credentials.
export const s3 = (endpoint: string) =>
  new S3Client({
    region: REGION,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  })

export class StorageLocalStackContainer extends Context.Service<StorageLocalStackContainer>()(
  '@lexiai/storage/testing/StorageLocalStackContainer',
  {
    // The module default wait strategy is `Wait.forLogMessage("Ready")`, NOT the `forListeningPorts`
    // exec probe that hangs on Docker Desktop/macOS — so, unlike `PgContainer`, no `withWaitStrategy`
    // override is needed. `SERVICES=s3` (only S3, not the dev compose's `sqs,s3`),
    // `EAGER_SERVICE_LOADING` inits S3 at boot so the first request isn't slow, `DEBUG=0` quiets logs.
    make: Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          new LocalstackContainer(IMAGE)
            .withEnvironment({ SERVICES: 's3', EAGER_SERVICE_LOADING: '1', DEBUG: '0' })
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
 * Run one S3 admin op (create bucket / list / get / delete — the harness's own bookkeeping, distinct
 * from the `Bun.S3Client` under test) against the running container with a short-lived SDK client,
 * destroying it on settle and mapping any failure to {@link ContainerError}.
 */
const withS3 = <A>(use: (client: S3Client) => Promise<A>) =>
  Effect.gen(function* () {
    const container = yield* StorageLocalStackContainer
    const client = s3(container.getConnectionUri())
    return yield* Effect.tryPromise({
      try: () => use(client).finally(() => client.destroy()),
      catch: (cause) => new ContainerError({ cause }),
    })
  })

/**
 * Provisions the bucket and resolves the `@lexiai/config` AWS seam (bucket / region / endpoint /
 * credentials) from the running container as a **replacement** `ConfigProvider`, so the base
 * `StorageClient` + the bound `ImagesStore` are pointed at LocalStack entirely through config — no
 * reliance on `Bun.S3Client`'s ambient-env credential snapshot (which ignores runtime injection); LocalStack
 * ignores the credential values. The dev provider (`ConfigProviderLive`, the `:4566` `.env`) is never
 * in the test layer graph, so the harness cannot leak to the dev LocalStack — the invariant the
 * queue/Postgres harnesses hold by building their client from the container endpoint, not the dev config.
 */
const StorageConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* StorageLocalStackContainer
    const endpoint = container.getConnectionUri()

    // Provision the isolated test bucket through the shared create-if-absent primitive, against the
    // container client. `ensureBucket` is an `Effect` (not a `Promise`), so it can't ride the
    // Promise-based `withS3`; run it on a short-lived container client here, remapping its
    // `BucketProvisionError` to the harness's `ContainerError` so this seam's failure surface holds.
    const provisionClient = s3(endpoint)
    yield* ensureBucket(provisionClient, BUCKET).pipe(
      Effect.mapError((cause) => new ContainerError({ cause })),
      Effect.ensuring(Effect.sync(() => provisionClient.destroy())),
    )

    return ConfigProvider.layer(
      ConfigProvider.fromDotEnvContents(
        [
          `IMAGES_BUCKET=${BUCKET}`,
          `AWS_REGION=${REGION}`,
          `AWS_ENDPOINT_URL=${endpoint}`,
          'AWS_ACCESS_KEY_ID=test',
          'AWS_SECRET_ACCESS_KEY=test',
        ].join('\n'),
      ),
    )
  }),
)

/**
 * The bound `ImagesStore` over the production `StorageClientLive` (real `Bun.S3Client`), pointed at
 * a per-file LocalStack S3 container — the storage analogue of `@lexiai/database/testing`'s
 * `TestDatabaseLive` and `@lexiai/queue/testing`'s `QueueLocalStackLive`. Boots a `LocalstackContainer`,
 * provisions the inventory bucket, and supplies the base+wrapper verbatim on the container's endpoint
 * (the wrapper binds that bucket via `ImagesBucket`). The container is also merged into the output
 * context so {@link bucketObjects} / {@link resetBucket} can inspect what landed. One container per
 * test file:
 *
 * @example
 * ```ts
 * it.layer(StorageLocalStackLive, { timeout: '120 seconds' })((it) => {
 *   it.effect('stores the hero image', () =>
 *     Effect.gen(function* () {
 *       yield* resetBucket
 *       const storage = yield* ImagesStore
 *       yield* storage.put(imageKey({ language, word, kind: 'hero' }), pngBytes, {
 *         contentType: 'image/png',
 *       })
 *       expect((yield* bucketObjects).map((o) => o.key)).toContain('visuals/en/lacuna/hero.png')
 *     }))
 * })
 * ```
 * @see `packages/queue/src/testing.ts` (the sibling pattern)
 */
export const StorageLocalStackLive = ImagesStoreLive.pipe(
  Layer.provide(StorageClientLive),
  Layer.provide(StorageConfigLive),
  Layer.provideMerge(StorageLocalStackContainer.layer),
)

/** One object read back from the test bucket — the persisted `(key, bytes, contentType)`. */
export interface StoredObject {
  readonly key: string
  readonly bytes: Uint8Array
  readonly contentType?: string
}

/**
 * Every object currently in the test bucket, fetched body-and-all, so a test can assert *what the
 * code under test wrote*. S3 LIST returns keys lexicographically, not in write order — assert against
 * a `Set` of keys, not an ordered array. The queue analogue is `drainQueue`'s "what got enqueued?".
 */
export const bucketObjects = withS3(async (client) => {
  const { Contents = [] } = await client.send(new ListObjectsV2Command({ Bucket: BUCKET }))
  const objects: StoredObject[] = []
  for (const { Key } of Contents) {
    if (Key === undefined) continue
    const object = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key }))
    const bytes = await object.Body?.transformToByteArray()
    objects.push({ key: Key, bytes: bytes ?? new Uint8Array(), contentType: object.ContentType })
  }
  return objects
})

/**
 * Empty the test bucket. Run at the START of each writing test, not in an `afterEach`: the `it.layer`
 * container is shared across the file, so a hook providing its own layer would spin up a second
 * container. The storage analogue of `@lexiai/database/testing`'s `resetDb` / `drainQueue`.
 */
export const resetBucket = withS3(async (client) => {
  const { Contents = [] } = await client.send(new ListObjectsV2Command({ Bucket: BUCKET }))
  for (const { Key } of Contents) {
    if (Key === undefined) continue
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }))
  }
})

/**
 * An `ImagesStore` for suites that must satisfy the layer's `ImagesStore` requirement but never write
 * (text-only `ContentEngine` stages, provenance) — it has no backing S3 and **dies** if `put` is
 * called, surfacing an unexpected write instead of silently no-op'ing. It does **not** need the base
 * `StorageClient`. Cheaper than a container for a suite that does no S3 I/O.
 */
export const UnusedStorage = Layer.succeed(
  ImagesStore,
  ImagesStore.of({
    put: (key) => Effect.die(`ImagesStore.put('${key}') called in a no-storage suite`),
  }),
)
