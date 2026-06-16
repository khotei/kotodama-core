import { Schema } from 'effect'
import { Language } from '../language'
import { FrequencyBand, SourceType, VisualKind } from './words.values'

/**
 * The authored effect schemas for the `words` jsonb columns — the single definition of each content
 * shape. The table ({@link wordsTable}) takes each column's `$type` from these (`typeof X.Type`), and
 * {@link WordEntity} overrides the same columns with these schemas so the entity is fully typed
 * rather than opaque `Json`. core derives its `WordModel` from the entity, so every word shape has
 * exactly one author here.
 */

/** Image/audio object key — images AND audio, hence `StorageKey`, not `ImageKey`. Presigned to a URL at read. */
export const StorageKey = Schema.String
export type StorageKey = typeof StorageKey.Type

export const Pronunciation = Schema.Struct({
  ipa: Schema.String,
  respelling: Schema.optional(Schema.String),
  audio: Schema.Struct({
    uk: Schema.NullOr(StorageKey),
    us: Schema.NullOr(StorageKey),
  }),
})
export type Pronunciation = typeof Pronunciation.Type

export const Lexical = Schema.Struct({
  partOfSpeech: Schema.String,
  countable: Schema.optional(Schema.Boolean),
  plural: Schema.optional(
    Schema.Struct({ primary: Schema.String, also: Schema.Array(Schema.String) }),
  ),
  register: Schema.Array(Schema.String),
})
export type Lexical = typeof Lexical.Type

export const TierExample = Schema.Struct({ text: Schema.String, register: Schema.String })
export type TierExample = typeof TierExample.Type

export const Tier = Schema.Struct({
  title: Schema.optional(Schema.String),
  body: Schema.String,
  examples: Schema.Array(TierExample),
})
export type Tier = typeof Tier.Type

/** The four depths of meaning (F-002), named verbatim from UF-002 / S-WordCard. */
export const Tiers = Schema.Struct({ quick: Tier, everyday: Tier, deep: Tier, cultural: Tier })
export type Tiers = typeof Tiers.Type

export const EtymologyStage = Schema.Struct({
  when: Schema.String,
  form: Schema.String,
  // Free-text name ("Latin"), not the `Language` enum.
  languageName: Schema.String,
  gloss: Schema.String,
  // Soft ref to a `Source.index` — app-enforced, no DB FK.
  citation: Schema.optional(Schema.Number),
})
export type EtymologyStage = typeof EtymologyStage.Type

export const Etymology = Schema.Struct({
  summary: Schema.String,
  firstAttested: Schema.Struct({ year: Schema.Number, language: Schema.String }),
  origin: Schema.Struct({ from: Schema.String, to: Schema.String, gloss: Schema.String }),
  descent: Schema.Array(EtymologyStage),
})
export type Etymology = typeof Etymology.Type

export const AuthorExample = Schema.Struct({
  author: Schema.String,
  authorImageUrl: Schema.optional(Schema.NullOr(StorageKey)),
  work: Schema.optional(Schema.String),
  language: Language,
  isGenerated: Schema.Boolean,
  quote: Schema.String,
})
export type AuthorExample = typeof AuthorExample.Type

export const CulturalTimelineEntry = Schema.Struct({ date: Schema.String, text: Schema.String })
export type CulturalTimelineEntry = typeof CulturalTimelineEntry.Type

export const CulturalGuide = Schema.Struct({
  timeline: Schema.Array(CulturalTimelineEntry),
  forecast2030: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.Array(Schema.String)),
})
export type CulturalGuide = typeof CulturalGuide.Type

export const RelatedTerm = Schema.Struct({
  term: Schema.String,
  note: Schema.optional(Schema.String),
})
export type RelatedTerm = typeof RelatedTerm.Type

export const Relations = Schema.Struct({
  synonyms: Schema.Array(RelatedTerm),
  antonyms: Schema.Array(RelatedTerm),
  family: Schema.Array(Schema.String),
})
export type Relations = typeof Relations.Type

/** `languageName` is a free-text name ("French"), not the `Language` enum. */
export const Translation = Schema.Struct({ languageName: Schema.String, term: Schema.String })
export type Translation = typeof Translation.Type

export const Visual = Schema.Struct({
  kind: VisualKind,
  imageKey: Schema.NullOr(StorageKey),
  prompt: Schema.String,
  caption: Schema.optional(Schema.String),
  concept: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
})
export type Visual = typeof Visual.Type

/** One hero, one infographic, N memes — not a flat `Visual[]`. */
export const Visuals = Schema.Struct({
  hero: Schema.NullOr(Visual),
  infographic: Schema.NullOr(Visual),
  memes: Schema.Array(Visual),
})
export type Visuals = typeof Visuals.Type

export const Source = Schema.Struct({
  index: Schema.Number,
  type: SourceType,
  title: Schema.String,
  url: Schema.optional(Schema.String),
  retrievedAt: Schema.optional(Schema.String),
  year: Schema.optional(Schema.Number),
  note: Schema.optional(Schema.String),
})
export type Source = typeof Source.Type

export const Frequency = Schema.Struct({
  band: FrequencyBand,
  trendNote: Schema.optional(Schema.String),
  series: Schema.optional(
    Schema.Array(Schema.Struct({ year: Schema.Number, value: Schema.Number })),
  ),
  changeNote: Schema.optional(Schema.String),
})
export type Frequency = typeof Frequency.Type

/**
 * Storage provenance for a generated row — which model/prompt/pipeline produced it. Persistence
 * metadata, not rendered content, so `WordModel` (core) drops it; it stays a column the build
 * stamps at promotion.
 */
export const SourceVersions = Schema.Struct({
  model: Schema.String,
  promptHash: Schema.String,
  pipeline: Schema.optional(Schema.String),
})
export type SourceVersions = typeof SourceVersions.Type
