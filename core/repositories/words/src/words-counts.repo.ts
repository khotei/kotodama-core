import { type AsyncJobStatus, byAsyncJobStatus, DB, wordsTable } from '@kotodama/database'
import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { type WordSearchQuery, wordSearchFilter } from './words-search.repo'

export type WordCounts = { readonly total: number } & Readonly<Record<AsyncJobStatus, number>>

function countFilter(statusCol: SQLWrapper, status: AsyncJobStatus) {
  return sql<number>`count(*) filter (where ${statusCol} = ${status})`.mapWith(Number)
}

const EMPTY_COUNTS: WordCounts = { total: 0, ...byAsyncJobStatus(() => 0) }

function countBuckets(statusCol: SQLWrapper) {
  return {
    total: sql<number>`count(*)`.mapWith(Number),
    ...byAsyncJobStatus((status) => countFilter(statusCol, status)),
  }
}

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
