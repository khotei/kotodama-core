import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { JobsQueue } from '../src'
import { drainQueue, QueueLocalStackLive } from '../src/testing'

// Contract test for the real adapter: `JobsQueueLive` against a per-file LocalStack SQS container.
// With the in-memory fake removed, ALL queue tests run on this real adapter (the queue analogue of the
// Testcontainers DB); these cases pin the bound port's contract — a real round-trip via `send(body)`
// and the received→invisible ack semantics the worker's delete-on-success rests on.
it.layer(QueueLocalStackLive, { timeout: '120 seconds' })((it) => {
  it.effect('JobsQueue round-trips send → receive → delete against LocalStack SQS', () =>
    Effect.gen(function* () {
      yield* drainQueue
      const queue = yield* JobsQueue
      yield* queue.send('hello')

      const [message] = yield* queue.receive({ max: 10, waitSeconds: 5 })
      expect(message?.body).toBe('hello')
      // A real SQS ReceiptHandle (opaque, non-empty) — not a fake's deterministic counter.
      expect(message?.handle).toBeTruthy()

      yield* queue.delete(message?.handle ?? '')
    }),
  )

  it.effect('a received-but-unacked message is invisible to the next receive', () =>
    Effect.gen(function* () {
      yield* drainQueue
      const queue = yield* JobsQueue
      yield* queue.send('first')

      const received = yield* queue.receive({ max: 10, waitSeconds: 5 })
      expect(received).toHaveLength(1)

      // In-flight (received, not deleted) ⇒ invisible until the visibility timeout, so a prompt
      // re-poll sees nothing. This is the ack contract the worker's delete-on-success depends on.
      const reread = yield* queue.receive({ max: 10, waitSeconds: 0 })
      expect(reread).toHaveLength(0)

      yield* queue.delete(received[0]?.handle ?? '')
    }),
  )
})
