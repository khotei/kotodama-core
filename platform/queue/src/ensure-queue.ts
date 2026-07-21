import { CreateQueueCommand, type SQSClient } from '@aws-sdk/client-sqs'
import { Effect } from 'effect'
import { QueueError } from './queue-types'

/**
 * Create-if-absent, idempotent with NO pre-check: `CreateQueue` with no attributes on an existing
 * same-name queue is itself a no-op returning the existing URL (SQS only rejects a re-create when
 * attributes differ, and we pass none).
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
