import { ASYNC_JOB_STATUSES, type AsyncJobStatus, DB, wordsTable } from '@kotodama/core/database'
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { type WordSearchQuery, wordSearchFilter } from './words-search.repo'

export type WordCounts = { readonly total: number } & Readonly<Record<AsyncJobStatus, number>>

const countFilter = (statusCol: SQLWrapper, status: AsyncJobStatus) =>
  sql<number>`count(*) filter (where ${statusCol} = ${status})`.mapWith(Number)

// Buckets derive from the one status vocabulary, so a new `AsyncJobStatus` grows every count by
// construction — the single-author discipline `wordSearchFilter` uses. `fromEntries` widens keys
// to `string`; the cast re-pins the exact status set, so dropping it silently drops buckets.
const EMPTY_COUNTS: WordCounts = {
  total: 0,
  ...(Object.fromEntries(ASYNC_JOB_STATUSES.map((status) => [status, 0])) as Record<
    AsyncJobStatus,
    number
  >),
}

const countBuckets = (statusCol: SQLWrapper) => ({
  total: sql<number>`count(*)`.mapWith(Number),
  ...(Object.fromEntries(
    ASYNC_JOB_STATUSES.map((status) => [status, countFilter(statusCol, status)]),
  ) as Record<AsyncJobStatus, ReturnType<typeof countFilter>>),
})

/**
 * Reads the exact `wordSearchFilter` the list uses, so the counts equal what the list can page —
 * one live `COUNT … FILTER` scan. An unfiltered call is just the empty filter over the language.
 */
export const selectWordCounts = Effect.fnUntraced(function* (
  query: Omit<WordSearchQuery, 'page' | 'limit'>,
) {
  const db = yield* DB
  const filtered = wordSearchFilter(query)
  const [counts] = yield* db
    .select(countBuckets(wordsTable.status))
    .from(wordsTable)
    .where(filtered)
  return (counts ?? EMPTY_COUNTS) satisfies WordCounts
})
