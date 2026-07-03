import { sql } from 'drizzle-orm'
import { check, index, jsonb, snakeCase, text, unique } from 'drizzle-orm/pg-core'
import { asyncJobStatus } from '../async-word-jobs/async-word-jobs.enums'
import { enumAsyncJobStatus } from '../async-word-jobs/async-word-jobs.values'
import { identifierColumn, timestampColumns } from '../columns'
import { enumLanguage, languageEnum } from '../language'
import type {
  AuthorExampleEntity,
  CulturalGuideEntity,
  EtymologyEntity,
  FrequencyEntity,
  LexicalEntity,
  PronunciationEntity,
  RelationsEntity,
  SourceEntity,
  SourceVersionsEntity,
  TiersEntity,
  TranslationEntity,
  VisualsEntity,
} from './words.entity'

/**
 * A lifecycle table: content columns are nullable (a row exists from the `pending` seed, long
 * before content) and the CHECK restores "succeeded ⇒ every content column non-null", so a
 * half-built word is unrepresentable at rest. `frequency` stays outside the CHECK
 * (analytics-owned, absent even from a built word). `status` has no default — every write states it.
 *
 * `snakeCase.table` owns the casing — do NOT also set `transformQueryNames` on `PgClient`
 * (double-transform corrupts names). The recency btrees sort `created_at DESC NULLS LAST` to match
 * the repo's ORDER BY — a mismatch forfeits the index-provided sort. The trgm GIN needs
 * `CREATE EXTENSION pg_trgm`, hand-patched into the baseline migration (drizzle-kit can't emit it).
 */
export const wordsTable = snakeCase.table(
  'words',
  {
    id: identifierColumn,
    word: text().notNull(),
    language: languageEnum().notNull().default(enumLanguage.en),
    status: asyncJobStatus().notNull(),
    coreDefinition: text(),
    lexical: jsonb().$type<LexicalEntity>(),
    pronunciation: jsonb().$type<PronunciationEntity>(),
    tiers: jsonb().$type<TiersEntity>(),
    etymology: jsonb().$type<EtymologyEntity>(),
    authorExamples: jsonb().$type<AuthorExampleEntity[]>(),
    culturalGuide: jsonb().$type<CulturalGuideEntity>(),
    relations: jsonb().$type<RelationsEntity>(),
    translations: jsonb().$type<TranslationEntity[]>(),
    visuals: jsonb().$type<VisualsEntity>(),
    sources: jsonb().$type<SourceEntity[]>(),
    sourceVersions: jsonb().$type<SourceVersionsEntity>(),
    frequency: jsonb().$type<FrequencyEntity>(),
    ...timestampColumns,
  },
  (t) => [
    unique().on(t.word, t.language),
    check(
      'words_succeeded_content_present',
      sql`${t.status} <> ${enumAsyncJobStatus.succeeded} OR (${t.coreDefinition} IS NOT NULL AND ${t.lexical} IS NOT NULL AND ${t.pronunciation} IS NOT NULL AND ${t.tiers} IS NOT NULL AND ${t.etymology} IS NOT NULL AND ${t.authorExamples} IS NOT NULL AND ${t.culturalGuide} IS NOT NULL AND ${t.relations} IS NOT NULL AND ${t.translations} IS NOT NULL AND ${t.visuals} IS NOT NULL AND ${t.sources} IS NOT NULL AND ${t.sourceVersions} IS NOT NULL)`,
    ),
    index('words_language_created_at_word_idx').on(
      t.language,
      t.createdAt.desc().nullsLast(),
      t.word,
    ),
    index('words_language_status_created_at_word_idx').on(
      t.language,
      t.status,
      t.createdAt.desc().nullsLast(),
      t.word,
    ),
    index('words_language_pos_created_at_word_idx')
      .on(
        t.language,
        sql`(${t.lexical} ->> 'partOfSpeech')`,
        t.createdAt.desc().nullsLast(),
        t.word,
      )
      .where(sql`${t.lexical} IS NOT NULL`),
    index('words_word_core_definition_trgm_idx').using(
      'gin',
      sql`${t.word} gin_trgm_ops`,
      sql`${t.coreDefinition} gin_trgm_ops`,
    ),
  ],
)

/** What repos return — `$inferSelect` preserves each jsonb `$type` (a derived schema would erase them to `Json`). */
export type WordRow = typeof wordsTable.$inferSelect

/** `status` is required in it (no column default); content columns are optional like the storage. */
export type WordInsert = typeof wordsTable.$inferInsert
