/**
 * `drizzle.config.ts` points `drizzle-kit` at this single barrel, NOT the `./schema` directory — a
 * dir glob would load each table twice (here and via the re-export). `columns.ts` is intentionally
 * NOT re-exported (internal helper); `language.ts` IS, so `drizzle-kit` emits the `language CREATE TYPE`.
 */
import { defineRelations } from 'drizzle-orm'
import { asyncWordJobsTable } from './async-word-jobs/async-word-jobs.table'
import { wordsTable } from './words/words.table'

export * from './async-word-jobs/async-word-jobs.content'
export * from './async-word-jobs/async-word-jobs.entity'
export * from './async-word-jobs/async-word-jobs.enums'
export * from './async-word-jobs/async-word-jobs.predicates'
export * from './async-word-jobs/async-word-jobs.table'
export * from './async-word-jobs/async-word-jobs.values'
export * from './language'
export * from './to-enum'
export * from './words/words.content'
export * from './words/words.entity'
export * from './words/words.table'
export * from './words/words.values'

/**
 * Neither table carries relations: a word's generation is N `async_word_jobs` rows (one per stage,
 * keyed by `(word, language, stage)`), and `words` is pristine (a row exists ⇔ ready). Both stay in
 * the schema map so `db.query.{wordsTable,asyncWordJobsTable}` exist.
 */
export const relations = defineRelations({ wordsTable, asyncWordJobsTable }, () => ({}))
