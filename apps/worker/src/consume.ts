import { JobsQueue, type ReceiveOptions } from '@lexiai/queue'
import { Context, Effect } from 'effect'
import { processBatch } from './process-batch'

/**
 * Long-poll tuning for {@link consumeOnce} — a `Context.Reference` so production wires nothing. The
 * default is the SQS maximum (a full batch, the longest server-side wait → fewest empty receives).
 * Tests `Layer.succeed` a short `waitSeconds` so an empty-queue poll returns promptly instead of
 * blocking the full 20s against real/LocalStack SQS.
 */
export const ConsumePoll = Context.Reference<ReceiveOptions>('@lexiai/app-worker/ConsumePoll', {
  defaultValue: () => ({ max: 10, waitSeconds: 20 }),
})

/**
 * The **local** edge (dev/test): one poll → run the batch via the shared {@link processBatch} core →
 * ack. Long-polls `JobsQueue.receive`, maps each message to a core record (`id = handle`), and
 * **deletes the successes** — those NOT in `processBatch`'s `failedIds` — leaving the failures for the
 * visibility-timeout redrive. This reproduces, by hand, the AWS event-source-mapping contract the prod
 * {@link sqsBatchHandler} gets for free (delete-on-success, replay-on-failure), so the two drivers stay
 * behaviourally identical by sharing the one core. Returns the number of messages received (0 on an
 * empty poll). A skipped foreign body is a non-failure, so it is deleted too (it would otherwise loop).
 *
 * Idempotency (a redelivered message converges on one word) is `buildWord`'s, asserted at the core.
 */
export const consumeOnce = Effect.gen(function* () {
  const queue = yield* JobsQueue
  const poll = yield* ConsumePoll
  const messages = yield* queue.receive(poll)
  const failed = new Set(
    yield* processBatch(messages.map((message) => ({ id: message.handle, body: message.body }))),
  )
  yield* Effect.forEach(
    messages.filter((message) => !failed.has(message.handle)),
    (message) => queue.delete(message.handle),
  )
  return messages.length
})

/**
 * The local worker's run loop: {@link consumeOnce}, forever. With the real SQS layer an empty queue
 * blocks in the long poll (no busy-spin); the `main.ts` entrypoint runs this under `BunRuntime`.
 * Resilience to a failing build (retry/backoff) lands later — this is the happy-path loop.
 */
export const consumeForever = Effect.forever(consumeOnce)
