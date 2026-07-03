import { it } from '@effect/vitest'
import { Effect } from 'effect'
import { ensureBucket } from '../src/provisioning'
import { StorageLocalStackContainer, s3 } from '../src/testing'

// A bucket name distinct from the harness's own `kotodama-test-visuals`, so the first ensure exercises
// the real create path (not a name LocalStack already holds).
const BUCKET = 'kotodama-test-provisioning'

// Provision the bucket directly against the container, bypassing `StorageLocalStackLive` (which
// pre-creates the prod bucket) — this suite owns the create-then-no-op path end to end.
it.layer(StorageLocalStackContainer.layer, { timeout: '120 seconds' })((it) => {
  it.effect('creates the bucket, then a second ensure is a clean no-op success (AC-3)', () =>
    Effect.gen(function* () {
      const container = yield* StorageLocalStackContainer
      const client = s3(container.getConnectionUri())

      yield* ensureBucket(client, BUCKET)
      yield* ensureBucket(client, BUCKET)
    }),
  )
})
