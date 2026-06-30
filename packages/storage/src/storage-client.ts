import { AwsClientConfig } from '@lexiai/config'
import { type Config, Context, Effect, Layer } from 'effect'
import { StorageError, type StoragePutOptions } from './storage-types'

export interface StorageClientShape {
  readonly put: (
    bucket: string,
    key: string,
    bytes: Uint8Array,
    opts?: StoragePutOptions,
  ) => Effect.Effect<string, StorageError>
}

/**
 * The parameterized storage base — one `Bun.S3Client` with **no bound bucket**, taking the bucket
 * **per call**. `put(bucket, key, bytes, opts?)` routes the write to the caller-supplied bucket via
 * `Bun.S3Client`'s per-call `S3Options.bucket` override, so a single client serves any number of
 * buckets without a per-bucket client pool. The bound {@link ImagesStore} wrapper (and a future
 * second-bucket wrapper) delegate here, fixing one bucket each. Reuses {@link StorageError} —
 * callers handle one tag.
 *
 * @example
 * ```ts
 * const storage = yield* StorageClient
 * const key = yield* storage.put('lexiai-images', imageKey({ language, word, kind: 'hero' }), png, {
 *   contentType: 'image/png',
 * })
 * ```
 */
export class StorageClient extends Context.Service<StorageClient, StorageClientShape>()(
  '@lexiai/storage/StorageClient',
) {}

/**
 * Concrete {@link StorageClient} over a single `Bun.S3Client` built from the shared
 * {@link AwsClientConfig} (region + credentials always, endpoint when set) — **no `bucket` bound at
 * construction**; the per-call `{ bucket }` on `client.write` is authoritative. `Bun.S3Client` is a
 * Bun runtime global, not an npm dep. A raw client rejection (network, credentials, bucket policy) is
 * wrapped in one {@link StorageError}; callers handle a single tag. Carries a `ConfigError` (config
 * resolves at layer build); `ConfigProviderLive` is supplied by the app entrypoint, not here.
 */
export const StorageClientLive: Layer.Layer<StorageClient, Config.ConfigError> = Layer.effect(
  StorageClient,
  Effect.gen(function* () {
    const aws = yield* AwsClientConfig

    const client = new Bun.S3Client({
      region: aws.region,
      ...(aws.endpoint !== undefined ? { endpoint: aws.endpoint } : {}),
      ...aws.credentials,
    })

    const put = (bucket: string, key: string, bytes: Uint8Array, opts: StoragePutOptions = {}) =>
      Effect.tryPromise(() => client.write(key, bytes, { type: opts.contentType, bucket })).pipe(
        Effect.as(key),
        Effect.mapError((cause) => new StorageError({ key, cause })),
      )

    return StorageClient.of({ put })
  }),
)
