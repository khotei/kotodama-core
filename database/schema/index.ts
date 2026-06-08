/**
 * `drizzle.config.ts` points `drizzle-kit` at this single barrel, NOT the `./schema` directory — a
 * dir glob would load each table twice (here and via the re-export). `columns.ts` is intentionally
 * NOT re-exported (internal helper); `enums.ts` IS, so `drizzle-kit` emits the `CREATE TYPE`s.
 */
import { defineRelations } from 'drizzle-orm'
import { asyncWordJobsTable } from './async-word-jobs/async-word-jobs.table'
import { wordsTable } from './words/words.table'

export * from './async-word-jobs/async-word-jobs.content-types'
export * from './async-word-jobs/async-word-jobs.enums'
export * from './async-word-jobs/async-word-jobs.schemas'
export * from './async-word-jobs/async-word-jobs.table'
export * from './enums'
export * from './words/words.content-types'
export * from './words/words.schemas'
export * from './words/words.table'

/**
 * Neither table carries relations: a word's generation is N `async_word_jobs` rows (one per stage,
 * keyed by `(word, language, stage)`), and `words` is pristine (a row exists ⇔ ready). Both stay in
 * the schema map so `db.query.{wordsTable,asyncWordJobsTable}` exist.
 */
export const relations = defineRelations({ wordsTable, asyncWordJobsTable }, () => ({}))
