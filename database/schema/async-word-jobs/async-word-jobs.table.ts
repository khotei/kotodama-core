import { jsonb, snakeCase, text, timestamp, unique } from 'drizzle-orm/pg-core'
import type { SetRequired } from 'type-fest'
import { identifierColumn, timestampColumns } from '../columns'
import { enumLanguage, languageEnum } from '../language'
import type { JobErrorEntity, StageResultEntity } from './async-word-jobs.entity'
import { asyncJobStatus, wordJobStage } from './async-word-jobs.enums'
import { enumAsyncJobStatus } from './async-word-jobs.values'

/**
 * One row per `(word, language, stage)` — structurally one row per stage (the UNIQUE is the upsert
 * target and covers the `word, language` prefix lookup). Regeneration resets rows in place; no
 * run/generation grouping, no history. `snakeCase.table` owns the casing — do NOT also set
 * `transformQueryNames` on `PgClient`.
 */
export const asyncWordJobsTable = snakeCase.table(
  'async-word-jobs',
  {
    id: identifierColumn,
    word: text().notNull(),
    language: languageEnum().notNull().default(enumLanguage.en),
    stage: wordJobStage().notNull(),
    status: asyncJobStatus().notNull().default(enumAsyncJobStatus.pending),
    result: jsonb().$type<StageResultEntity>(),
    error: jsonb().$type<JobErrorEntity>(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    ...timestampColumns,
  },
  (t) => [unique('async_word_jobs_stage_uq').on(t.word, t.language, t.stage)],
)

/** What repos return — `$inferSelect` preserves each jsonb `$type` (a derived schema would erase them to `Json`). */
export type AsyncWordJobRow = typeof asyncWordJobsTable.$inferSelect

/**
 * The write shape — `language`/`status` are required so every creation states them instead of
 * silently inheriting the column defaults (`en`/`pending`) the reader would have to look up in the
 * table. Only the DB-generated envelope (`id`, timestamps) stays optional.
 */
export type AsyncWordJobInsert = SetRequired<
  typeof asyncWordJobsTable.$inferInsert,
  'language' | 'status'
>
