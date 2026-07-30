import { type SQLWrapper, sql } from 'drizzle-orm'
import { check, index, jsonb, snakeCase, text, unique } from 'drizzle-orm/pg-core'
import { identifierColumn, timestampColumns } from '../columns'
import { enumLanguage, languageEnum } from '../language'
import type { BuildStagesEntity } from './build-stages.entity'
import { asyncJobStatus, enumAsyncJobStatus } from './word-status'
import type {
  AuthorExampleEntity,
  BuildProvenanceEntity,
  CulturalGuideEntity,
  EtymologyEntity,
  FrequencyEntity,
  LexicalEntity,
  PronunciationEntity,
  RelationsEntity,
  SourceEntity,
  TiersEntity,
  TranslationEntity,
  VisualsEntity,
} from './words.entity'

/**
 * Reads as the ready-invariant it encodes: **when the row is `succeeded`, every listed column must
 * be present (non-null)**. A not-yet-ready row (`pending`/`running`/`failed`) is free to hold NULLs,
 * and any column left off the list — `frequency` — may be NULL even when succeeded. Hides the SQL
 * material-implication (`status <> 'succeeded' OR …`) behind the sentence it means.
 */
const requireWhenSucceeded = (status: SQLWrapper, present: readonly SQLWrapper[]) =>
  sql`${status} <> ${enumAsyncJobStatus.succeeded} OR (${sql.join(
    present.map((column) => sql`${column} IS NOT NULL`),
    sql` AND `,
  )})`

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
    // Per-stage build progress on the aggregate itself (replaces a per-stage table): every
    // transition co-writes it with `status`. Defaults `[]` so the NOT NULL add is safe on existing
    // rows; the request seed writes all six `pending` immediately.
    stages: jsonb().$type<BuildStagesEntity>().notNull().default(sql`'[]'::jsonb`),
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
    provenance: jsonb().$type<BuildProvenanceEntity>(),
    frequency: jsonb().$type<FrequencyEntity>(),
    ...timestampColumns,
  },
  (t) => [
    unique().on(t.word, t.language),
    check(
      'words_succeeded_content_present',
      requireWhenSucceeded(t.status, [
        t.coreDefinition,
        t.lexical,
        t.pronunciation,
        t.tiers,
        t.etymology,
        t.authorExamples,
        t.culturalGuide,
        t.relations,
        t.translations,
        t.visuals,
        t.sources,
        t.provenance,
      ]),
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
