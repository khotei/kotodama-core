import { GetObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer } from 'effect'
import { ensureBucket } from '../src/provisioning'
import { StorageClient, StorageClientLive } from '../src/storage-client'
import { StorageLocalStackContainer, s3 } from '../src/testing'

const REGION = 'us-east-1'
const BUCKET_A = 'bucket-a'
const BUCKET_B = 'bucket-b'

// `StorageClientLive` (real `Bun.S3Client`, no bound bucket) pointed at a per-file LocalStack S3
// container through a replacement `ConfigProvider` from the container endpoint — the dev-untouched
// invariant the sibling harness holds. Two distinct buckets are provisioned at layer build so the
// per-call-routing test can target each. `ConfigProviderLive` (the dev `:4566` config) is never in
// this graph, so the test cannot reach the dev LocalStack.
const MultiBucketLive = Layer.unwrap(
  Effect.gen(function* () {
    const container = yield* StorageLocalStackContainer
    const endpoint = container.getConnectionUri()

    const provisionClient = s3(endpoint)
    yield* Effect.forEach([BUCKET_A, BUCKET_B], (name) => ensureBucket(provisionClient, name)).pipe(
      Effect.ensuring(Effect.sync(() => provisionClient.destroy())),
    )

    return StorageClientLive.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromDotEnvContents(
            [
              `AWS_REGION=${REGION}`,
              `AWS_ENDPOINT_URL=${endpoint}`,
              'AWS_ACCESS_KEY_ID=test',
              'AWS_SECRET_ACCESS_KEY=test',
            ].join('\n'),
          ),
        ),
      ),
    )
  }),
).pipe(Layer.provideMerge(StorageLocalStackContainer.layer))

// Read one object's bytes back from a specific bucket via the admin SDK client — the harness's own
// bookkeeping, distinct from the `Bun.S3Client` under test, so the assertion proves where the bytes
// actually landed rather than trusting the writer.
const readBytes = (bucket: string, key: string) =>
  Effect.gen(function* () {
    const container = yield* StorageLocalStackContainer
    const client = s3(container.getConnectionUri())
    return yield* Effect.promise(() =>
      client
        .send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        .then((o) => o.Body?.transformToByteArray())
        .finally(() => client.destroy()),
    )
  })

// Multi-resource proof (AC-3): the same key written to two buckets must read back each bucket's own
// bytes, demonstrating genuine per-call `{ bucket }` routing — not a single bound bucket.
describe('StorageClient.put — per-call bucket routing', () => {
  it.layer(MultiBucketLive, { timeout: '120 seconds' })((it) => {
    it.effect('routes the same key to the caller-supplied bucket (AC-3)', () =>
      Effect.gen(function* () {
        const storage = yield* StorageClient
        const key = 'visuals/en/lacuna/hero.png'
        const bytesA = new Uint8Array([1, 2, 3])
        const bytesB = new Uint8Array([9, 8, 7])

        expect(yield* storage.put(BUCKET_A, key, bytesA)).toBe(key)
        expect(yield* storage.put(BUCKET_B, key, bytesB)).toBe(key)

        expect(yield* readBytes(BUCKET_A, key)).toEqual(bytesA)
        expect(yield* readBytes(BUCKET_B, key)).toEqual(bytesB)
      }),
    )
  })
})
