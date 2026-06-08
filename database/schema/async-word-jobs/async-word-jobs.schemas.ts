import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Schema } from 'effect'
import { asyncWordJobsTable } from './async-word-jobs.table'

/** The derived Schemas erase the jsonb `$type` to generic `Json`, so repos return the Row instead. */
export type AsyncWordJobRow = typeof asyncWordJobsTable.$inferSelect

export const AsyncWordJobSchema = createSelectSchema(asyncWordJobsTable)
export type AsyncWordJobSchema = Schema.Schema.Type<typeof AsyncWordJobSchema>

export const AsyncWordJobSchemaInsert = createInsertSchema(asyncWordJobsTable)
export type AsyncWordJobSchemaInsert = Schema.Schema.Type<typeof AsyncWordJobSchemaInsert>
