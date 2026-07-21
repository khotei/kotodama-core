import { describe, expect, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer } from 'effect'
import { ImagesStore, ImagesStoreLive } from '../src/images-store'
import { StorageClientLive } from '../src/storage-client'
import { authorKey, imageKey, StorageError } from '../src/storage-types'
import { bucketObjects, resetBucket, StorageLocalStackLive } from '../src/testing'

const HERO = imageKey({ language: 'en', word: 'lacuna', kind: 'hero' })

describe('imageKey / authorKey', () => {
  it('builds the deterministic visuals path', () => {
    expect(HERO).toBe('visuals/en/lacuna/hero.png')
  })

  it('builds the deterministic authors path', () => {
    expect(authorKey({ language: 'fr', word: 'flaneur', index: 2 })).toBe(
      'authors/fr/flaneur/2.png',
    )
  })
})

// Adapter-contract test: the bound `ImagesStore` over the real `Bun.S3Client` against LocalStack S3 —
// the one place the bound `put` (no bucket arg → the configured images bucket) is exercised end-to-end.
it.layer(StorageLocalStackLive, { timeout: '120 seconds' })((it) => {
  it.effect('writes bytes to the images bucket under the key and returns it (AC-5)', () =>
    Effect.gen(function* () {
      yield* resetBucket
      const storage = yield* ImagesStore
      const bytes = new Uint8Array([1, 2, 3])

      const returned = yield* storage.put(HERO, bytes, { contentType: 'image/png' })
      expect(returned).toBe(HERO)

      const objects = yield* bucketObjects
      expect(objects).toHaveLength(1)
      expect(objects[0]?.key).toBe(HERO)
      expect(objects[0]?.bytes).toEqual(bytes)
      expect(objects[0]?.contentType).toBe('image/png')
    }),
  )
})

// The bound `ImagesStore` over a `StorageClient` pointed at a dead endpoint: every write rejects, so
// this exercises the error channel (client rejection → one `StorageError`) without a container.
const StorageBroken = ImagesStoreLive.pipe(
  Layer.provide(StorageClientLive),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromDotEnvContents(
        [
          'IMAGES_BUCKET=kotodama-test-visuals',
          'AWS_REGION=us-east-1',
          'AWS_ENDPOINT_URL=http://127.0.0.1:1',
          'AWS_ACCESS_KEY_ID=test',
          'AWS_SECRET_ACCESS_KEY=test',
        ].join('\n'),
      ),
    ),
  ),
)

describe('ImagesStore.put — failure', () => {
  it.effect('maps a backend rejection to StorageError carrying the key', () =>
    Effect.gen(function* () {
      const storage = yield* ImagesStore
      const error = yield* storage.put(HERO, new Uint8Array([1]), {}).pipe(Effect.flip)
      expect(error).toBeInstanceOf(StorageError)
      expect(error.key).toBe(HERO)
    }).pipe(Effect.provide(StorageBroken)),
  )
})
