import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
import { wordsTable } from './words.table'

/**
 * Derived `effect/Schema` row-schemas for the `words` table.
 *
 * SCHEMA-BOUNDARY RULE (hard constraint): these import `drizzle-orm`, so they
 * live in `database/` (backend-only) and MUST NOT be imported from the
 * isomorphic `@lexiai/schemas` (`effect`-only). If the frontend needs a word
 * shape, hand-author a plain `effect/Schema` there, decoupled from this table.
 */

export const WordRow = createSelectSchema(wordsTable)
export type WordRow = Schema.Schema.Type<typeof WordRow>

/**
 * `term` refined non-empty; the refine runs before the column becomes
 * nullable/optional. effect v4 uses `.check(Schema.isMinLength(1))`, not the v3
 * `.pipe(Schema.minLength(1))`.
 */
export const WordRowInsert = createInsertSchema(wordsTable, {
  term: (schema) => schema.check(Schema.isMinLength(1)),
})
export type WordRowInsert = Schema.Schema.Type<typeof WordRowInsert>
