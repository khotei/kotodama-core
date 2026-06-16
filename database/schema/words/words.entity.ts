import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
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
 * `Json` (its `$type` doesn't survive derivation — `drizzle-effect.md`). This is the schema core's
 * `WordModel` is derived from (it omits the storage envelope), so the word shape has one author: the
 * content schemas here.
 *
 * Reads go through the {@link WordRow} type (trusted DB data, no decode); this schema earns its keep
 * as the derivation source for the domain model and as the validated shape at the write boundary.
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
  // cast. `WordEntity`/`WordModel` keep the readonly default (they're read/domain shapes).
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
