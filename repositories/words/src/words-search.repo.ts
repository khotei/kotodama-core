import type { AsyncJobStatus, Language, WordRow } from '@lexiai/database'
import { DB, wordsTable } from '@lexiai/database'
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import { Effect } from 'effect'

export type WordSearchQuery = {
  readonly language: Language
  readonly q?: string
  readonly status?: AsyncJobStatus
  /** 1-based page number (default 1). Only meaningful together with `limit`. */
  readonly page?: number
  /** Page size. Absent = the whole match, unpaged (`page` ignored). Default/ceiling are API-edge policy. */
  readonly limit?: number
}

export type WordSearchResult = {
  readonly items: readonly WordRow[]
  /** Total matches across all pages — feeds `pageCount` for numbered-page navigation. */
  readonly total: number
}

/**
 * The one author of the list/counts filter — `selectWordCounts` imports it verbatim, which is what makes
 * the counts and the list agree by construction. `q` is a case-insensitive substring over `word`
 * and the ready-branch gloss (`core_definition`, NULL on a building row ⇒ ready-only by
 * construction). Keep it in exactly one file.
 */
export const wordSearchFilter = (query: Pick<WordSearchQuery, 'language' | 'q' | 'status'>) =>
  and(
    eq(wordsTable.language, query.language),
    query.q
      ? or(ilike(wordsTable.word, `%${query.q}%`), ilike(wordsTable.coreDefinition, `%${query.q}%`))
      : undefined,
    query.status ? eq(wordsTable.status, query.status) : undefined,
  )

// `nulls last` matches the index DDL — plain `DESC` (= NULLS FIRST) mismatches the pathkeys and
// forces a full Sort. `created_at` is NOT NULL, so it's a semantic no-op kept purely for the index.
const recencyOrder = [sql`${wordsTable.createdAt} desc nulls last`, asc(wordsTable.word)]

export const searchWords = Effect.fnUntraced(function* (query: WordSearchQuery) {
  const db = yield* DB
  const { page = 1, limit } = query
  const filtered = wordSearchFilter(query)
  const listed = db
    .select()
    .from(wordsTable)
    .where(filtered)
    .orderBy(...recencyOrder)
    .$dynamic()
  // A separate COUNT, not `count(*) OVER()`: the window count would materialize the whole match and
  // defeat the paged scan; the standalone count uses the same index over the filter.
  const [counted] = yield* db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(wordsTable)
    .where(filtered)
  const items = yield* limit === undefined ? listed : listed.limit(limit).offset((page - 1) * limit)
  return { items, total: counted?.total ?? 0 } satisfies WordSearchResult
})
