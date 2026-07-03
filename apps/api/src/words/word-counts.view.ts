import { Schema } from 'effect'

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export const WordCountsView = Schema.Struct({
  total: Count,
  pending: Count,
  running: Count,
  succeeded: Count,
  failed: Count,
})
export type WordCountsView = typeof WordCountsView.Type
