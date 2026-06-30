import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema, Struct } from 'effect'
import { Language } from '../language'
import {
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
} from './words.content'
import { wordsTable } from './words.table'

/**
 * The `words` row as a runtime effect Schema — identity + storage envelope (`id`, timestamps,
 * `sourceVersions`) + content. Each jsonb column is **overridden** with its authored content schema
 * so the entity is fully typed; a bare `createSelectSchema` would erase every jsonb column to opaque
 * `Json` (its `$type` doesn't survive derivation — `drizzle-effect.md`). This is the row schema the
 * API contract composes and that `core` consumes directly (there is no per-row model), so the word
 * shape has one author: the content schemas here.
 *
 * Reads go through the {@link WordRow} type (trusted DB data, no decode); this schema earns its keep
 * as the per-row payload the API contract composes and as the validated shape at the write boundary.
 */
export const WordEntity = createSelectSchema(wordsTable, {
  // The DB never stores an empty headword; refine so the derived model keeps the non-empty contract.
  word: (schema) => schema.check(Schema.isMinLength(1)),
  lexical: Lexical,
  pronunciation: Pronunciation,
  tiers: Tiers,
  etymology: Etymology,
  authorExamples: Schema.Array(AuthorExample),
  culturalGuide: CulturalGuide,
  relations: Relations,
  translations: Schema.Array(Translation),
  visuals: Visuals,
  sources: Schema.Array(Source),
  sourceVersions: SourceVersions,
  // A bare-schema override owns its own nullability (column nullability is not auto-applied).
  frequency: Schema.NullOr(Frequency),
})
export type WordEntity = typeof WordEntity.Type

/**
 * A word's generated **content** — every content field, minus the storage envelope (`id`,
 * timestamps), identity (`word`, `language`), and provenance (`sourceVersions`). This is what the
 * content pipeline produces and `assembleWord` turns into a row (adding identity + provenance, then
 * decoding through {@link WordEntityInsert}). Derived from {@link WordEntity} by dropping the envelope,
 * so the content shape has one author and cannot drift from the row — and so the content pipeline's
 * per-stage slices (`STAGE_SLICES`, `@lexiai/core-content`) `pick` their fields straight off it rather
 * than re-binding each field's schema.
 */
export const WordContentSchema = WordEntity.mapFields(
  Struct.omit(['id', 'word', 'language', 'sourceVersions', 'createdAt', 'updatedAt']),
)
export type WordContent = typeof WordContentSchema.Type

/**
 * The validated **insert** shape — what the build's promotion decodes the assembled engine output
 * against before the upsert (the generation source is untrusted, unlike a stored row). Same jsonb
 * overrides as {@link WordEntity}; `createInsertSchema` makes the DB-generated columns
 * (`id`, timestamps) optional, so the caller supplies identity + content +
 * `sourceVersions`. This is why the entity earns a runtime schema — `WordRow` (`$inferSelect`) is a
 * type only and validates nothing.
 */
export const WordEntityInsert = createInsertSchema(wordsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // Bare override ⇒ required: a defaulted column would otherwise derive optional, letting a write
  // silently inherit the table default `en` — the write boundary must state the language (WordInsert).
  language: Language,
  lexical: Lexical,
  pronunciation: Pronunciation,
  tiers: Tiers,
  etymology: Etymology,
  // The insert schema's sole consumer is Drizzle's mutable `.insert().values()`, so the array
  // columns are `mutable` to match `$inferInsert` — decoded output drops in with no readonly→mutable
  // cast. `WordEntity` keeps the readonly default (it's a read/domain shape).
  authorExamples: Schema.mutable(Schema.Array(AuthorExample)),
  culturalGuide: CulturalGuide,
  relations: Relations,
  translations: Schema.mutable(Schema.Array(Translation)),
  visuals: Visuals,
  sources: Schema.mutable(Schema.Array(Source)),
  sourceVersions: SourceVersions,
  frequency: Schema.NullOr(Frequency),
})
export type WordEntityInsert = typeof WordEntityInsert.Type
