import { JobsQueue, type ReceiveOptions } from '@lexiai/queue'
import { Context, Effect } from 'effect'
import { processBatch } from './process-batch'

// Default = the SQS maximum (fewest empty receives); tests Layer.succeed a short wait so an
// empty-queue poll returns promptly instead of blocking 20s.
export const ConsumePoll = Context.Reference<ReceiveOptions>('@lexiai/app-worker/ConsumePoll', {
  defaultValue: () => ({ max: 10, waitSeconds: 20 }),
})

/**
 * The local edge: poll → shared core → delete the successes, leaving failures to the
 * visibility-timeout redrive — reproducing by hand the event-source-mapping contract the prod
 * handler gets from AWS, so the two drivers stay behaviourally identical.
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

// An empty queue blocks in the long poll — no busy-spin.
export const consumeForever = Effect.forever(consumeOnce)
