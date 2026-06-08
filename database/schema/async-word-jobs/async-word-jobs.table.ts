import { integer, jsonb, snakeCase, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { identifierColumn, timestampColumns } from '../columns'
import { enumLanguage, languageEnum } from '../enums'
import type { JobError, StageResult } from './async-word-jobs.content-types'
import { asyncJobStatus, enumAsyncJobStatus, wordJobStage } from './async-word-jobs.enums'

/**
 * One row per `(word, language, stage)` of a word's generation pipeline — `StageState` flattened out of
 * jsonb into columns. A word being generated has one row per planned stage; the worker advances each.
 *
 * `UNIQUE(word, language, stage)` is the only constraint needed: it is the `initializeStages` upsert
 * target, the lookup key for `findStages`/`patchStages`, AND covers the `word = ? AND language = ?`
 * prefix — so there is structurally one row per stage (no "one active run per word" partial-unique
 * dedup, unlike the old payload model). Regeneration resets these rows in place; no run/generation
 * grouping and no history.
 *
 * `snakeCase.table` owns camelCase→snake_case casing, so do NOT also set `transformQueryNames` on
 * `PgClient`. `word`/`language` mirror `words` so the anchor matches `words.UNIQUE(word, language)`.
 */
export const asyncWordJobsTable = snakeCase.table(
  'async-word-jobs',
  {
    id: identifierColumn,
    word: text().notNull(),
    language: languageEnum().notNull().default(enumLanguage.en),
    stage: wordJobStage().notNull(),
    status: asyncJobStatus().notNull().default(enumAsyncJobStatus.pending),
    attempts: integer().notNull().default(0),
    result: jsonb().$type<StageResult>(),
    error: jsonb().$type<JobError>(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    ...timestampColumns,
  },
  (t) => [unique('async_word_jobs_stage_uq').on(t.word, t.language, t.stage)],
)
