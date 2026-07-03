import { AwsClientConfig } from '@kotodama/config'
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
 * The parameterized base — one `Bun.S3Client`, no bound bucket: the per-call `S3Options.bucket`
 * override routes each write, so one client serves any number of buckets.
 */
export class StorageClient extends Context.Service<StorageClient, StorageClientShape>()(
  '@kotodama/storage/StorageClient',
) {}

// Config-resolved credentials via AwsClientConfig, never Bun.S3Client's ambient env read — the
// client snapshots ambient creds at process start and ignores runtime injection.
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
