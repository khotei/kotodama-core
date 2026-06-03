import { index, jsonb, snakeCase, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

/**
 * Provisional JSONB shapes — placeholders so column types aren't `unknown`; firm
 * up with the word-generation feature. NOTE: `effect-schema` derives a generic
 * JSON union for every `jsonb` column regardless of `$type`, so these refine the
 * Drizzle side only, not the derived row-schemas in `words.schemas.ts`.
 */
export type PartOfSpeech = { readonly tag: string; readonly definitions: readonly string[] }
export type Pronunciation = { readonly ipa: string; readonly audioKey: string | null }
export type LiteraryContext = {
  readonly quotes: readonly { readonly text: string; readonly source: string }[]
}
export type CulturalContext = { readonly notes: readonly string[] }
export type SourceVersions = { readonly model: string; readonly promptHash: string }

/**
 * `snakeCase.table` maps camelCase keys to snake_case SQL (`createdAt` →
 * `created_at`). Casing is owned here — do NOT also set `transformQueryNames` on
 * `PgClient`, which double-transforms and corrupts names. Multi-word tables use
 * kebab-case identifiers (e.g. `word-cards`); raw `sql`/`TRUNCATE` must quote them.
 */
export const wordsTable = snakeCase.table(
  'words',
  {
    id: uuid().primaryKey().defaultRandom(),
    term: text().notNull(),
    locale: text({ enum: ['ru', 'en'] })
      .notNull()
      .default('en'),
    status: text({ enum: ['pending', 'ready', 'failed'] }).notNull(),
    explanation: text(),
    literaryContext: jsonb().$type<LiteraryContext>(),
    culturalContext: jsonb().$type<CulturalContext>(),
    partsOfSpeech: jsonb().$type<readonly PartOfSpeech[]>(),
    pronunciation: jsonb().$type<Pronunciation | null>(),
    heroImageKey: text(),
    memeImageKey: text(),
    sourceVersions: jsonb().$type<SourceVersions>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.term, t.locale), index().on(t.status)],
)
