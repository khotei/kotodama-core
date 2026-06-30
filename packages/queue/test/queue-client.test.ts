import { expect, it } from '@effect/vitest'
import { awsResources } from '@lexiai/config'
import { Effect } from 'effect'
import { QueueClient } from '../src'
import { ensureQueue } from '../src/ensure-queue'
import { QueueClientLocalStackLive, withSqs } from '../src/testing'

// Adapter-contract test for the parameterized base: `QueueClientLive` over a per-file LocalStack SQS
// container. Unlike the bound `JobsQueue`, `QueueClient` holds no bound queue — the round-trip is driven
// with an EXPLICIT url provisioned via `ensureQueue`, which is the whole point of the multi-queue base.
it.layer(QueueClientLocalStackLive, { timeout: '120 seconds' })((it) => {
  it.effect('QueueClient round-trips send → receive → delete against an explicit queue URL', () =>
    Effect.gen(function* () {
      const url = yield* withSqs((client) => ensureQueue(client, awsResources.jobsQueue.name))
      const client = yield* QueueClient

      yield* client.send(url, 'hello')

      const [message] = yield* client.receive(url, { max: 10, waitSeconds: 5 })
      expect(message?.body).toBe('hello')
      expect(message?.handle).toBeTruthy()

      yield* client.delete(url, message?.handle ?? '')
    }),
  )
})
