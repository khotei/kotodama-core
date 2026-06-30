import { CreateQueueCommand, type SQSClient } from '@aws-sdk/client-sqs'
import { Effect } from 'effect'
import { QueueError } from './queue-types'

/**
 * Create-if-absent over SQS: returns the queue's URL, creating it on first call. **Idempotent with no
 * pre-check** — `CreateQueue` with no attributes on an existing same-name queue is itself a no-op that
 * returns the existing URL (SQS only rejects a re-create when attributes differ, and we pass none), so
 * a second call just re-resolves the URL rather than failing. The `SQSClient` is a parameter (the
 * caller owns its lifecycle); any SDK rejection — or a success with no `QueueUrl` — maps to the
 * package's {@link QueueError}.
 */
export const ensureQueue = Effect.fnUntraced(function* (client: SQSClient, name: string) {
  const { QueueUrl } = yield* Effect.tryPromise({
    try: () => client.send(new CreateQueueCommand({ QueueName: name })),
    catch: (cause) => new QueueError({ cause }),
  })
  if (QueueUrl === undefined) {
    return yield* Effect.fail(new QueueError({ cause: 'CreateQueue returned no QueueUrl' }))
  }
  return QueueUrl
})
