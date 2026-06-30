import { ImagesBucket } from '@lexiai/config'
import { Context, Effect, Layer } from 'effect'
import { StorageClient } from './storage-client'
import type { StorageError, StoragePutOptions } from './storage-types'

export interface ImagesStoreShape {
  readonly put: (
    key: string,
    bytes: Uint8Array,
    opts?: StoragePutOptions,
  ) => Effect.Effect<string, StorageError>
}

/**
 * The bound object store for today's single images bucket: the resource-free port business code
 * yields. Fixes `awsResources.imagesBucket` → `IMAGES_BUCKET` (the existing {@link ImagesBucket}
 * config) and exposes `put(key, bytes, opts?)`, delegating to {@link StorageClient} with that bucket —
 * so the content engine's `renderToStorage` (`storage.put(key, bytes, { contentType })`) never learns
 * the bucket parameter. The returned key is handed straight back (write → store key).
 *
 * It is **not** a deep-modules §5 pass-through: the base speaks `(bucket, …)`, this speaks `(…)` — it
 * removes a parameter by owning the *which-bucket* binding. A second bucket later (audio, separate
 * visuals) is one more such wrapper over the same base, with no base change.
 *
 * @see `packages/storage/CLAUDE.md`
 */
export class ImagesStore extends Context.Service<ImagesStore, ImagesStoreShape>()(
  '@lexiai/storage/ImagesStore',
) {}

/**
 * {@link ImagesStore} over {@link StorageClient}: binds `IMAGES_BUCKET` at layer build and delegates
 * every `put` to the base with that bucket. Requires `StorageClient` (provide `StorageClientLive`
 * beneath it) and carries a `ConfigError` for `ImagesBucket` — closed by the entrypoint's
 * `ConfigProviderLive`.
 *
 * @see `.claude/rules/config.md`
 */
export const ImagesStoreLive = Layer.effect(
  ImagesStore,
  Effect.gen(function* () {
    const client = yield* StorageClient
    const bucket = yield* ImagesBucket

    return {
      put: (key, bytes, opts) => client.put(bucket, key, bytes, opts),
    }
  }),
)
