import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
import { Language } from '../language'
import { JobError, StageResult } from './async-word-jobs.content'
import { asyncWordJobsTable } from './async-word-jobs.table'
import { ASYNC_JOB_STATUSES } from './async-word-jobs.values'

/**
 * The `async_word_jobs` row as a runtime effect Schema — identity + storage envelope (`id`, timestamps)
 * + per-stage state. The `result`/`error` jsonb columns are **overridden** with their
 * authored content schemas so the entity is fully typed; a bare `createSelectSchema` erases every jsonb
 * column to opaque `Json` (its `$type` doesn't survive derivation — `drizzle-effect.md`). This is the
 * row schema the API contract composes and that `core` consumes directly (there is no per-row model),
 * so the job shape has one author: the content schemas here.
 *
 * Reads go through the {@link AsyncWordJobRow} type (trusted DB data, no decode); this schema earns its
 * keep as the per-row payload the API contract composes and as the validated shape at write boundaries.
 */
export const AsyncWordJobEntity = createSelectSchema(asyncWordJobsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // A bare-schema override owns its own nullability — both columns are nullable in storage.
  result: Schema.NullOr(StageResult),
  error: Schema.NullOr(JobError),
})
export type AsyncWordJobEntity = typeof AsyncWordJobEntity.Type

/**
 * The validated **insert** shape — same jsonb overrides as {@link AsyncWordJobEntity};
 * `createInsertSchema` makes the DB-generated columns (`id`, timestamps) optional, so a caller
 * supplies identity + stage + status. Mirrors `WordEntityInsert`: the runtime-typed shape to decode
 * an untrusted write against before it hits the table.
 */
export const AsyncWordJobEntityInsert = createInsertSchema(asyncWordJobsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // Bare overrides ⇒ required: defaulted columns would otherwise derive optional, letting a write
  // silently inherit the table defaults `en`/`pending` — the write boundary must state both
  // (AsyncWordJobInsert).
  language: Language,
  status: Schema.Literals(ASYNC_JOB_STATUSES),
  result: Schema.NullOr(StageResult),
  error: Schema.NullOr(JobError),
})
export type AsyncWordJobEntityInsert = typeof AsyncWordJobEntityInsert.Type
