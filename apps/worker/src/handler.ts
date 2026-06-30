import type { SQSEvent } from 'aws-lambda'
import { Effect } from 'effect'
import { type BatchRecord, processBatch } from './process-batch'

/**
 * The prod edge — a Lambda SQS event-source-mapping handler as a **deploy-clean** Effect: map the
 * event's records to the shared {@link processBatch} core and report only the failures as
 * `batchItemFailures` (AWS deletes the successes; the failures redrive).
 *
 * `itemIdentifier` is the inbound `messageId` **verbatim** (a wrong/empty id would fail the whole
 * batch). The effect's error channel is `never` — a build error becomes a failed *item*, never a
 * thrown exception, so AWS does not replay an entire successfully-built batch (the load-bearing
 * invariant). Wrapping this into the actual `(SQSEvent) => Promise<SQSBatchResponse>` Lambda entry
 * (a managed runtime built once, the prod layer provided, `runPromise`) is the deploy/packaging
 * feature's job — this module stays free of `BunRuntime` and layer wiring.
 */
export const sqsBatchHandler = Effect.fnUntraced(function* (event: SQSEvent) {
  const records: ReadonlyArray<BatchRecord> = event.Records.map((record) => ({
    id: record.messageId,
    body: record.body,
  }))
  const failedIds = yield* processBatch(records)
  return { batchItemFailures: failedIds.map((itemIdentifier) => ({ itemIdentifier })) }
})
