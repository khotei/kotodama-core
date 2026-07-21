import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema } from 'effect'
import { Language } from '../language'
import { BuildStagesEntity } from './build-stages.entity'
import { wordsTable } from './words.table'
import { FrequencyBand, SourceType, VisualKind } from './words.values'

/**
 * The authored schemas for the `words` jsonb columns — the single author of each content shape
 * (the table reads its `$type`s from these; {@link WordEntity} overrides the columns with them).
 *
 * Field modality is a domain decision, and these schemas double as the engine's `generateObject`
 * argument, which shapes it:
 * - Plain-required = "exists for every valid word AND the model can always produce it" — required
 *   denies the model its `null` escape hatch, forcing real content.
 * - `Schema.NullOr` only where "unknown" is a legal *stored* state.
 * - `Schema.optionalKey` (never `Schema.optional`) where the thing may not exist in the world —
 *   OpenAI structured output rejects `undefined` in the AST, translates every key to
 *   required-nullable, and decodes a returned `null` back to an absent key.
 * - Render-filled keys (`imageKey`, `authorImageUrl`) are required HERE: a stored word always has
 *   its images. The generation *plan* variant (`@kotodama/core/content`) omits them and the render
 *   step fills them — the plan, not this stored schema, carries the absence.
 */

/** Image/audio object key — presigned to a URL at read; never a URL in storage. */
export const StorageKey = Schema.String
export type StorageKey = typeof StorageKey.Type

export const PronunciationEntity = Schema.Struct({
  ipa: Schema.String,
  respelling: Schema.String,
  audio: Schema.Struct({
    uk: Schema.NullOr(StorageKey),
    us: Schema.NullOr(StorageKey),
  }),
})
export type PronunciationEntity = typeof PronunciationEntity.Type

export const LexicalEntity = Schema.Struct({
  partOfSpeech: Schema.String,
  countable: Schema.optionalKey(Schema.Boolean),
  plural: Schema.optionalKey(
    Schema.Struct({ primary: Schema.String, also: Schema.Array(Schema.String) }),
  ),
  register: Schema.Array(Schema.String),
})
export type LexicalEntity = typeof LexicalEntity.Type

export const TierExampleEntity = Schema.Struct({ text: Schema.String, register: Schema.String })
export type TierExampleEntity = typeof TierExampleEntity.Type

export const TierEntity = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  examples: Schema.Array(TierExampleEntity),
})
export type TierEntity = typeof TierEntity.Type

export const TiersEntity = Schema.Struct({
  quick: TierEntity,
  everyday: TierEntity,
  deep: TierEntity,
  cultural: TierEntity,
})
export type TiersEntity = typeof TiersEntity.Type

export const EtymologyStageEntity = Schema.Struct({
  when: Schema.String,
  form: Schema.String,
  // Free-text name ("Latin"), not the `Language` enum.
  languageName: Schema.String,
  gloss: Schema.String,
  // Soft ref to a `SourceEntity.index` — app-enforced, no DB FK.
  citation: Schema.optionalKey(Schema.Number),
})
export type EtymologyStageEntity = typeof EtymologyStageEntity.Type

export const EtymologyEntity = Schema.Struct({
  summary: Schema.String,
  // `year` nullable: often genuinely unknown, and a required Number forced the model to emit `NaN`
  // (a structured-output decode failure).
  firstAttested: Schema.Struct({ year: Schema.NullOr(Schema.Number), language: Schema.String }),
  origin: Schema.Struct({ from: Schema.String, to: Schema.String, gloss: Schema.String }),
  descent: Schema.Array(EtymologyStageEntity),
})
export type EtymologyEntity = typeof EtymologyEntity.Type

export const AuthorExampleEntity = Schema.Struct({
  author: Schema.String,
  authorImageUrl: StorageKey,
  work: Schema.optionalKey(Schema.String),
  language: Language,
  isGenerated: Schema.Boolean,
  quote: Schema.String,
})
export type AuthorExampleEntity = typeof AuthorExampleEntity.Type

export const CulturalTimelineEntryEntity = Schema.Struct({
  date: Schema.String,
  text: Schema.String,
})
export type CulturalTimelineEntryEntity = typeof CulturalTimelineEntryEntity.Type

export const CulturalGuideEntity = Schema.Struct({
  timeline: Schema.Array(CulturalTimelineEntryEntity),
  forecast2030: Schema.optionalKey(Schema.String),
  notes: Schema.Array(Schema.String),
})
export type CulturalGuideEntity = typeof CulturalGuideEntity.Type

export const RelatedTermEntity = Schema.Struct({
  term: Schema.String,
  note: Schema.optionalKey(Schema.String),
})
export type RelatedTermEntity = typeof RelatedTermEntity.Type

export const RelationsEntity = Schema.Struct({
  synonyms: Schema.Array(RelatedTermEntity),
  antonyms: Schema.Array(RelatedTermEntity),
  family: Schema.Array(Schema.String),
})
export type RelationsEntity = typeof RelationsEntity.Type

// `language` is the machine ISO code (the FE localizes the name), not a free-text name.
export const TranslationEntity = Schema.Struct({ language: Language, term: Schema.String })
export type TranslationEntity = typeof TranslationEntity.Type

export const VisualEntity = Schema.Struct({
  kind: VisualKind,
  imageKey: StorageKey,
  prompt: Schema.String,
  caption: Schema.optionalKey(Schema.String),
  concept: Schema.String,
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})
export type VisualEntity = typeof VisualEntity.Type

export const VisualsEntity = Schema.Struct({
  hero: VisualEntity,
  infographic: VisualEntity,
  memes: Schema.Array(VisualEntity),
})
export type VisualsEntity = typeof VisualsEntity.Type

export const SourceEntity = Schema.Struct({
  index: Schema.Number,
  type: SourceType,
  title: Schema.String,
  url: Schema.optionalKey(Schema.String),
  retrievedAt: Schema.optionalKey(Schema.String),
  year: Schema.optionalKey(Schema.Number),
  note: Schema.optionalKey(Schema.String),
})
export type SourceEntity = typeof SourceEntity.Type

export const FrequencyEntity = Schema.Struct({
  band: FrequencyBand,
  trendNote: Schema.optionalKey(Schema.String),
  series: Schema.Array(Schema.Struct({ year: Schema.Number, value: Schema.Number })),
  changeNote: Schema.optionalKey(Schema.String),
})
export type FrequencyEntity = typeof FrequencyEntity.Type

/**
 * Which models/prompts/pipeline produced the row — stamped at promotion, static per engine
 * version, so "find stale words" can detect a recipe change.
 */
export const SourceVersionsEntity = Schema.Struct({
  model: Schema.String,
  promptHash: Schema.String,
  pipeline: Schema.optionalKey(Schema.String),
  stageModels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})
export type SourceVersionsEntity = typeof SourceVersionsEntity.Type

/**
 * The `words` row as a runtime schema, every jsonb column overridden with its authored content
 * schema (a bare `createSelectSchema` erases `$type` to opaque `Json` — `drizzle-effect.md`).
 *
 * Deliberately the strict **ready-row** shape (content non-null) even though the table's content
 * columns are nullable: `ReadyWord` pins it and `WordContent`/`STAGE_SLICES` derive from it. The
 * permissive lifecycle row is decoded by the `Word` union (`@kotodama/core/words`), never by
 * loosening this schema.
 */
export const WordEntity = createSelectSchema(wordsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // Bare override so `coreDefinition` reads non-null like the jsonb columns: the text() column is
  // nullable, and deriving it NullOr would let a succeeded row with a null coreDefinition satisfy
  // the ready leaf — breaking the CHECK invariant at decode.
  stages: BuildStagesEntity,
  coreDefinition: Schema.String,
  lexical: LexicalEntity,
  pronunciation: PronunciationEntity,
  tiers: TiersEntity,
  etymology: EtymologyEntity,
  authorExamples: Schema.Array(AuthorExampleEntity),
  culturalGuide: CulturalGuideEntity,
  relations: RelationsEntity,
  translations: Schema.Array(TranslationEntity),
  visuals: VisualsEntity,
  sources: Schema.Array(SourceEntity),
  sourceVersions: SourceVersionsEntity,
  // A bare-schema override owns its own nullability (column nullability is not auto-applied).
  frequency: Schema.NullOr(FrequencyEntity),
})
export type WordEntity = typeof WordEntity.Type

/**
 * The validated insert shape — what an untrusted write (the promote's assembled LLM output)
 * decodes against; `WordRow` is a type only and validates nothing.
 *
 * Every content column is `Schema.NullOr`, never `optionalKey`: under `patchOnConflict` a `NullOr`
 * field always carries its key, so "no data" lands as an explicit `null` and **clears** stale
 * content — a regen promote resets what a prior build left behind. The CHECK still rejects a
 * `succeeded` row with a null content column at the engine.
 */
export const WordEntityInsert = createInsertSchema(wordsTable, {
  word: (schema) => schema.check(Schema.isMinLength(1)),
  // Bare override ⇒ required: the defaulted column would derive optional, letting a write silently
  // inherit the table default `en` — the write boundary must state the language.
  language: Language,
  // Always written (never cleared), so plain-required, not `NullOr` like the content columns.
  stages: BuildStagesEntity,
  coreDefinition: Schema.NullOr(Schema.String),
  lexical: Schema.NullOr(LexicalEntity),
  pronunciation: Schema.NullOr(PronunciationEntity),
  tiers: Schema.NullOr(TiersEntity),
  etymology: Schema.NullOr(EtymologyEntity),
  // `mutable` matches `$inferInsert`, so decoded output feeds `.values()` with no readonly cast;
  // `WordEntity` keeps the readonly default (a read/domain shape).
  authorExamples: Schema.NullOr(Schema.mutable(Schema.Array(AuthorExampleEntity))),
  culturalGuide: Schema.NullOr(CulturalGuideEntity),
  relations: Schema.NullOr(RelationsEntity),
  translations: Schema.NullOr(Schema.mutable(Schema.Array(TranslationEntity))),
  visuals: Schema.NullOr(VisualsEntity),
  sources: Schema.NullOr(Schema.mutable(Schema.Array(SourceEntity))),
  sourceVersions: Schema.NullOr(SourceVersionsEntity),
  frequency: Schema.NullOr(FrequencyEntity),
})
export type WordEntityInsert = typeof WordEntityInsert.Type
