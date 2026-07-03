import type { AsyncJobStatus } from '@lexiai/database'
import { DB, wordsTable } from '@lexiai/database'
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { type WordSearchQuery, wordSearchFilter } from './words-search.repo'

export type WordCounts = {
  readonly total: number
  readonly pending: number
  readonly running: number
  readonly succeeded: number
  readonly failed: number
}

const EMPTY_COUNTS: WordCounts = {
  total: 0,
  pending: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
}

const countFilter = (statusCol: SQLWrapper, status: AsyncJobStatus) =>
  sql<number>`count(*) filter (where ${statusCol} = ${status})`.mapWith(Number)

const countBuckets = (statusCol: SQLWrapper) => ({
  total: sql<number>`count(*)`.mapWith(Number),
  pending: countFilter(statusCol, 'pending'),
  running: countFilter(statusCol, 'running'),
  succeeded: countFilter(statusCol, 'succeeded'),
  failed: countFilter(statusCol, 'failed'),
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
