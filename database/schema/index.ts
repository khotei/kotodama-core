/**
 * Schema barrel for `@lexiai/database`. `drizzle.config.ts` points `drizzle-kit`
 * at this single `./schema/index.ts` file (not the `./schema` directory — a
 * directory glob would load each table twice, here and via this barrel's
 * re-export). The DB layer (`src/db.ts`) feeds `relations` into
 * `PgDrizzle.make({ relations })`. Each entity lives in its own folder:
 * `words/{words.table,words.schemas}`.
 */
import { defineRelations } from 'drizzle-orm'
import { wordsTable } from './words/words.table'

export * from './words/words.schemas'
export * from './words/words.table'

/**
 * Relational config for RQB v2 (`db.query.*`). Single table with no foreign
 * keys yet, so this is the empty single-arg form; relations land as new tables
 * with FKs arrive in their own features.
 */
export const relations = defineRelations({ wordsTable })
