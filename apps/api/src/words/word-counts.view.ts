import { ASYNC_JOB_STATUSES, type AsyncJobStatus } from '@kotodama/core/database'
import { Schema } from 'effect'

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

// The status buckets derive from the one vocabulary, so this wire shape and the repo's `WordCounts`
// track a new `AsyncJobStatus` by construction. `fromEntries` widens keys to `string`; the cast
// re-pins the status set so `Struct` keeps the exact fields.
export const WordCountsView = Schema.Struct({
  total: Count,
  ...(Object.fromEntries(ASYNC_JOB_STATUSES.map((status) => [status, Count])) as Record<
    AsyncJobStatus,
    typeof Count
  >),
})
export type WordCountsView = typeof WordCountsView.Type
