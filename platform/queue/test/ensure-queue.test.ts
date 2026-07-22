import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { ensureQueue } from '../src'
import { QueueLocalStackLive, withSqs } from '../src/testing'

// `ensureQueue` is exercised against the per-file LocalStack SQS container — the only double for the
// queue (no fake). `withSqs` builds the SDK client at the container endpoint, so this test owns the
// create-if-absent contract over a real SQS, not a stub.
it.layer(QueueLocalStackLive, { timeout: '120 seconds' })((it) => {
  it.effect('creates the queue and returns its URL; called twice returns the same URL (AC-3)', () =>
    withSqs((client) =>
      Effect.gen(function* () {
        const first = yield* ensureQueue(client, 'kotodama-ensure-test')
        const second = yield* ensureQueue(client, 'kotodama-ensure-test')

        expect(first).toBeTruthy()
        expect(second).toBe(first)
      }),
    ),
  )
})
