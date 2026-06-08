import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
import { wordsTable } from './words.table'

export type WordRow = typeof wordsTable.$inferSelect

export const WordSchema = createSelectSchema(wordsTable)
export type WordSchema = Schema.Schema.Type<typeof WordSchema>

/** `word` refined non-empty — effect v4 `.check(...)`, not v3 `.pipe(...)`. */
export const WordSchemaInsert = createInsertSchema(wordsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
})
export type WordSchemaInsert = Schema.Schema.Type<typeof WordSchemaInsert>
