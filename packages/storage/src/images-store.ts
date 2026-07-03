import { ImagesBucket } from '@kotodama/config'
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
 * The bound wrapper business code yields — not a pass-through: the base speaks `(bucket, …)`, this
 * speaks `(…)`, removing a parameter by owning the which-bucket binding. A second bucket is one
 * more wrapper over the same base.
 */
export class ImagesStore extends Context.Service<ImagesStore, ImagesStoreShape>()(
  '@kotodama/storage/ImagesStore',
) {}

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
