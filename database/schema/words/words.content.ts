import { Schema } from 'effect'
import { Language } from '../language'
import { FrequencyBand, SourceType, VisualKind } from './words.values'

/**
 * The authored effect schemas for the `words` jsonb columns — the single definition of each content
 * shape. The table ({@link wordsTable}) takes each column's `$type` from these (`typeof X.Type`), and
 * {@link WordEntity} overrides the same columns with these schemas so the entity is fully typed
 * rather than opaque `Json`. `core` and the API contract consume the entity directly (there is no
 * per-row model), so every word shape has exactly one author here.
 *
 * **Required vs nullable vs optional is a domain decision, not convenience.** A field is plain-required
 * (`Schema.String`) when it exists for every valid word AND the model can always produce it
 * (`Tier.title`, `Pronunciation.respelling`, `Visual.concept`) — required denies the model its only
 * escape hatch (below), forcing real content. It is `Schema.NullOr` only when "unknown" is a legal
 * *stored* state (`firstAttested.year`, `frequency`). It is `Schema.optionalKey` only when the thing
 * genuinely may not exist in the world (a quote with no `work`, a book `Source` with no `url`).
 *
 * **Render-filled keys are required here, nullable only in the generation plan.** `Visual.imageKey` and
 * `AuthorExample.authorImageUrl` are plain-required: a stored word always has its images rendered, so
 * the entity — the shape `core`, the API contract, and the FE read — guarantees them. The model cannot
 * know an S3 key while planning, so the *generation plan* (`@lexiai/core-content`'s `real-content-engine`)
 * **omits** the key and the render step adds it; that plan variant, not this stored schema, carries the
 * absence. Likewise `Visuals.hero`/`infographic` are required — every stored word gets both.
 *
 * Optional content fields use `Schema.optionalKey` (`key?: T`), never `Schema.optional`
 * (`key?: T | undefined`): these schemas are the real engine's `generateObject` argument, and OpenAI
 * structured output rejects an `undefined` in the AST. It translates *every* key to a required-nullable
 * and decodes a returned `null` back to an absent key (`effect/unstable/ai/OpenAiStructuredOutput`) —
 * so the model is always forced to emit the key and `optionalKey` only buys it a `null` escape. That is
 * precisely why always-present fields are plain-required: take the null away.
 */

/** Image/audio object key — images AND audio, hence `StorageKey`, not `ImageKey`. Presigned to a URL at read. */
export const StorageKey = Schema.String
export type StorageKey = typeof StorageKey.Type

export const Pronunciation = Schema.Struct({
  ipa: Schema.String,
  respelling: Schema.String,
  audio: Schema.Struct({
    uk: Schema.NullOr(StorageKey),
    us: Schema.NullOr(StorageKey),
  }),
})
export type Pronunciation = typeof Pronunciation.Type

export const Lexical = Schema.Struct({
  partOfSpeech: Schema.String,
  countable: Schema.optionalKey(Schema.Boolean),
  plural: Schema.optionalKey(
    Schema.Struct({ primary: Schema.String, also: Schema.Array(Schema.String) }),
  ),
  register: Schema.Array(Schema.String),
})
export type Lexical = typeof Lexical.Type

export const TierExample = Schema.Struct({ text: Schema.String, register: Schema.String })
export type TierExample = typeof TierExample.Type

export const Tier = Schema.Struct({
  title: Schema.String,
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
  citation: Schema.optionalKey(Schema.Number),
})
export type EtymologyStage = typeof EtymologyStage.Type

export const Etymology = Schema.Struct({
  summary: Schema.String,
  // `year` is nullable: for many words the first-attestation year is genuinely unknown, and a
  // required `Number` forced the model to emit `NaN` (a structured-output decode failure). `null`
  // gives "unknown" a legal value under strict structured output.
  firstAttested: Schema.Struct({ year: Schema.NullOr(Schema.Number), language: Schema.String }),
  origin: Schema.Struct({ from: Schema.String, to: Schema.String, gloss: Schema.String }),
  descent: Schema.Array(EtymologyStage),
})
export type Etymology = typeof Etymology.Type

export const AuthorExample = Schema.Struct({
  author: Schema.String,
  authorImageUrl: StorageKey,
  work: Schema.optionalKey(Schema.String),
  language: Language,
  isGenerated: Schema.Boolean,
  quote: Schema.String,
})
export type AuthorExample = typeof AuthorExample.Type

export const CulturalTimelineEntry = Schema.Struct({ date: Schema.String, text: Schema.String })
export type CulturalTimelineEntry = typeof CulturalTimelineEntry.Type

export const CulturalGuide = Schema.Struct({
  timeline: Schema.Array(CulturalTimelineEntry),
  forecast2030: Schema.optionalKey(Schema.String),
  notes: Schema.Array(Schema.String),
})
export type CulturalGuide = typeof CulturalGuide.Type

export const RelatedTerm = Schema.Struct({
  term: Schema.String,
  note: Schema.optionalKey(Schema.String),
})
export type RelatedTerm = typeof RelatedTerm.Type

export const Relations = Schema.Struct({
  synonyms: Schema.Array(RelatedTerm),
  antonyms: Schema.Array(RelatedTerm),
  family: Schema.Array(Schema.String),
})
export type Relations = typeof Relations.Type

/**
 * One translation of the headword. `language` is a stable ISO 639-1 code from {@link Language} — the
 * machine value, not a free-text name — so the card localizes the name (frontend) and links every
 * translation straight to that word (the code is always a real word language). `term` is the headword
 * in that language.
 */
export const Translation = Schema.Struct({ language: Language, term: Schema.String })
export type Translation = typeof Translation.Type

export const Visual = Schema.Struct({
  kind: VisualKind,
  imageKey: StorageKey,
  prompt: Schema.String,
  caption: Schema.optionalKey(Schema.String),
  concept: Schema.String,
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})
export type Visual = typeof Visual.Type

/**
 * One hero, one infographic, N memes — not a flat `Visual[]`. `hero`/`infographic` are required: every
 * stored word gets both (the generation plan no longer permits a `null` here — see the header note and
 * `@lexiai/core-content`).
 */
export const Visuals = Schema.Struct({
  hero: Visual,
  infographic: Visual,
  memes: Schema.Array(Visual),
})
export type Visuals = typeof Visuals.Type

export const Source = Schema.Struct({
  index: Schema.Number,
  type: SourceType,
  title: Schema.String,
  url: Schema.optionalKey(Schema.String),
  retrievedAt: Schema.optionalKey(Schema.String),
  year: Schema.optionalKey(Schema.Number),
  note: Schema.optionalKey(Schema.String),
})
export type Source = typeof Source.Type

export const Frequency = Schema.Struct({
  band: FrequencyBand,
  trendNote: Schema.optionalKey(Schema.String),
  series: Schema.Array(Schema.Struct({ year: Schema.Number, value: Schema.Number })),
  changeNote: Schema.optionalKey(Schema.String),
})
export type Frequency = typeof Frequency.Type

/**
 * Storage provenance for a generated row — which models/prompts/pipeline produced it. Persistence
 * metadata, not rendered content; a column the build stamps at promotion. `model` is the primary-tier
 * label; `stageModels` is the full per-stage/role model map (so swapping any model shifts provenance),
 * and `promptHash` digests every prompt surface — together they let "find stale words" detect a recipe
 * change. Static per engine version: identical across all words one engine built.
 */
export const SourceVersions = Schema.Struct({
  model: Schema.String,
  promptHash: Schema.String,
  pipeline: Schema.optionalKey(Schema.String),
  stageModels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})
export type SourceVersions = typeof SourceVersions.Type
