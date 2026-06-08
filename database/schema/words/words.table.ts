import { jsonb, snakeCase, text, unique } from 'drizzle-orm/pg-core'
import { identifierColumn, timestampColumns } from '../columns'
import { enumLanguage, languageEnum } from '../enums'
import type {
  AuthorExample,
  CulturalGuide,
  Etymology,
  Frequency,
  Lexical,
  Pronunciation,
  Relations,
  Source,
  SourceVersions,
  Tiers,
  Translation,
  Visuals,
} from './words.content-types'

/**
 * Pristine: a `words` row exists ⇔ the word is ready — all generation content is merged in NOT
 * NULL, so there is no half-word and no `status`. The lone exception is `frequency` (nullable,
 * owned by the later analytics feature).
 *
 * `snakeCase.table` owns camelCase→snake_case casing, so do NOT also set `transformQueryNames` on
 * `PgClient` (double-transform corrupts names). `UNIQUE(word, language)` is both the lookup index
 * (covers `word = ? AND language = ?` and a `word = ?` prefix) and the `create` upsert conflict
 * target — no separate secondary index needed.
 */
export const wordsTable = snakeCase.table(
  'words',
  {
    id: identifierColumn,
    word: text().notNull(),
    language: languageEnum().notNull().default(enumLanguage.en),
    coreDefinition: text().notNull(),
    lexical: jsonb().$type<Lexical>().notNull(),
    pronunciation: jsonb().$type<Pronunciation>().notNull(),
    tiers: jsonb().$type<Tiers>().notNull(),
    etymology: jsonb().$type<Etymology>().notNull(),
    authorExamples: jsonb().$type<AuthorExample[]>().notNull().default([]),
    culturalGuide: jsonb().$type<CulturalGuide>().notNull(),
    relations: jsonb().$type<Relations>().notNull(),
    translations: jsonb().$type<Translation[]>().notNull().default([]),
    visuals: jsonb().$type<Visuals>().notNull(),
    sources: jsonb().$type<Source[]>().notNull().default([]),
    sourceVersions: jsonb().$type<SourceVersions>().notNull(),
    frequency: jsonb().$type<Frequency>(),
    ...timestampColumns,
  },
  (t) => [unique().on(t.word, t.language)],
)
