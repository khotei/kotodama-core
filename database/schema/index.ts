/**
 * `drizzle.config.ts` points `drizzle-kit` at this single barrel, NOT the `./schema` directory — a
 * dir glob would load each table twice (here and via the re-export). `utils/columns.ts` is
 * intentionally NOT re-exported (internal helper); the `primitives` (language + status pgEnums) ARE,
 * so `drizzle-kit` emits their `CREATE TYPE`s.
 */
import { defineRelations } from 'drizzle-orm'
import { wordsTable } from './words/words.table'

export * from './primitives'
export * from './utils/to-enum'
export * from './words/build-stages.entity'
export * from './words/words.entity'
export * from './words/words.table'
export * from './words/words.values'

/**
 * `words` is one lifecycle row per `(word, language)` carrying its build progress inline
 * (`words.stages`), so there is no second table and no relation to declare — it stays in the schema
 * map only so `db.query.wordsTable` exists.
 */
export const relations = defineRelations({ wordsTable }, () => ({}))
