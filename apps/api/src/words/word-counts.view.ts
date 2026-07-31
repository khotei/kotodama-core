import { byAsyncJobStatus } from '@kotodama/database'
import { Schema } from 'effect'

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

// One bucket per status, mirroring the repo's `WordCounts` by construction — the shared `byAsyncJobStatus`
// keeps this wire shape and that read shape in lockstep as the status vocabulary grows.
export const WordCountsView = Schema.Struct({
  total: Count,
  ...byAsyncJobStatus(() => Count),
})
export type WordCountsView = typeof WordCountsView.Type
