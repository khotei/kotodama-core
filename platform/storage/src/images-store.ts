import { AwsClientConfig, ImagesBucket } from '@kotodama/platform/config'
import { type Config, Context, Effect, Layer } from 'effect'
import { StorageError, type StoragePutOptions } from './storage-types'

export interface ImagesStoreShape {
  readonly put: (
    key: string,
    bytes: Uint8Array,
    opts?: StoragePutOptions,
  ) => Effect.Effect<string, StorageError>
}

/**
 * The object-storage port, bound to the images bucket at layer build — the `Layer` reads
 * `ImagesBucket` from config so `put` carries no bucket argument. Keys come from the deterministic
 * scheme in `storage-types.ts`; `put` returns the key so a stage threads one value.
 */
export class ImagesStore extends Context.Service<ImagesStore, ImagesStoreShape>()(
  '@kotodama/platform/storage/ImagesStore',
) {}

// Config-resolved credentials + bucket via AwsClientConfig, never Bun.S3Client's ambient env read —
// the client snapshots ambient creds at process start and ignores runtime injection.
export const ImagesStoreLive: Layer.Layer<ImagesStore, Config.ConfigError> = Layer.effect(
  ImagesStore,
  Effect.gen(function* () {
    const aws = yield* AwsClientConfig
    const bucket = yield* ImagesBucket

    const client = new Bun.S3Client({
      region: aws.region,
      ...(aws.endpoint !== undefined ? { endpoint: aws.endpoint } : {}),
      ...aws.credentials,
    })

    const put = (key: string, bytes: Uint8Array, opts: StoragePutOptions = {}) =>
      Effect.tryPromise(() => client.write(key, bytes, { type: opts.contentType, bucket })).pipe(
        Effect.as(key),
        Effect.mapError((cause) => new StorageError({ key, cause })),
      )

    return ImagesStore.of({ put })
  }),
)
