import type { SQSEvent } from 'aws-lambda'
import { Effect } from 'effect'
import { type BatchRecord, processBatch } from './process-batch'

/**
 * The prod edge. The error channel is `never` — a build error becomes a failed *item*, never a
 * thrown exception, or AWS would replay the whole successfully-built batch. `itemIdentifier` is
 * the inbound `messageId` verbatim (a wrong/empty id fails the whole batch). Deliberately
 * deploy-clean: no `BunRuntime`/layer wiring — packaging into the real Lambda entry is a later
 * infra feature.
 */
export const sqsBatchHandler = Effect.fnUntraced(function* (event: SQSEvent) {
  const records: ReadonlyArray<BatchRecord> = event.Records.map((record) => ({
    id: record.messageId,
    body: record.body,
  }))
  const failedIds = yield* processBatch(records)
  return { batchItemFailures: failedIds.map((itemIdentifier) => ({ itemIdentifier })) }
})
