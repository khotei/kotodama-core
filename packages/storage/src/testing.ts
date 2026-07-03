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

class ContainerError extends Data.TaggedError('ContainerError')<{ cause: unknown }> {}

export interface StoredObject {
  readonly key: string
  readonly bytes: Uint8Array
  readonly contentType?: string
}

const IMAGE = 'localstack/localstack:4.4.0'
const REGION = 'us-east-1'
// Reusing the inventory name across files is collision-free — isolation is the per-file container.
const BUCKET = awsResources.imagesBucket.name

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
    // Unlike `PgContainer`, no `withWaitStrategy` override: the module default is log-based, not
    // the exec probe that hangs on Docker Desktop/macOS.
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

/** A short-lived harness SDK client (distinct from the `Bun.S3Client` under test) for S3 admin ops. */
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
 * A **replacement** ConfigProvider built from the running container — the only way to point
 * `Bun.S3Client` at LocalStack (it snapshots ambient creds at process start and ignores runtime
 * env injection), and `ConfigProviderLive` (the dev `.env`) is never in the test layer graph, so
 * the harness cannot leak to the dev LocalStack.
 */
const StorageConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* StorageLocalStackContainer
    const endpoint = container.getConnectionUri()

    // `ensureBucket` is an Effect, so it can't ride the Promise-based `withS3`.
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
 * The production base+wrapper verbatim on a per-file LocalStack container — the storage analogue
 * of `QueueLocalStackLive`. The container is merged into the output context so
 * {@link bucketObjects} / {@link resetBucket} can inspect what landed.
 */
export const StorageLocalStackLive = ImagesStoreLive.pipe(
  Layer.provide(StorageClientLive),
  Layer.provide(StorageConfigLive),
  Layer.provideMerge(StorageLocalStackContainer.layer),
)

/**
 * Every object in the test bucket, body-and-all. S3 LIST returns keys lexicographically, not in
 * write order — assert against a Set of keys, never an ordered array.
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
 * Run at the START of each writing test, not in an `afterEach` — the `it.layer` container is
 * shared across the file, and a hook providing its own layer would spin up a second container.
 */
export const resetBucket = withS3(async (client) => {
  const { Contents = [] } = await client.send(new ListObjectsV2Command({ Bucket: BUCKET }))
  for (const { Key } of Contents) {
    if (Key === undefined) continue
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }))
  }
})

/**
 * For suites that satisfy the `ImagesStore` requirement but never write — dies on `put`, surfacing
 * an unexpected write instead of silently no-op'ing. Cheaper than a container.
 */
export const UnusedStorage = Layer.succeed(
  ImagesStore,
  ImagesStore.of({
    put: (key) => Effect.die(`ImagesStore.put('${key}') called in a no-storage suite`),
  }),
)
