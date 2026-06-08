import { type Language, toEnum } from '../enums'

/**
 * The jsonb `$type`s carried by the merged `words` columns. Compile-time only: the derived
 * `effect/Schema` erases them to `Json`, so read typed columns off the `$inferSelect` row and
 * validate untrusted LLM JSON with a hand-authored `effect/Schema` at the write boundary.
 */

/** Images AND audio — hence `StorageKey`, not `ImageKey`. Presigned at read. */
export type StorageKey = string

/** Distinct from the free-text `languageName` *names* (e.g. "Latin"). */
export type Locale = Language

export type Pronunciation = {
  ipa: string
  respelling?: string
  audio: { uk: StorageKey | null; us: StorageKey | null }
}

export type Lexical = {
  partOfSpeech: string
  countable?: boolean
  plural?: { primary: string; also: string[] }
  register: string[]
}

export type TierExample = { text: string; register: string }
export type Tier = { title?: string; body: string; examples: TierExample[] }
export type Tiers = { quick: Tier; everyday: Tier; deep: Tier; cultural: Tier }

export type EtymologyStage = {
  when: string
  form: string
  // Free-text name ("Latin"), not the `Locale` enum.
  languageName: string
  gloss: string
  // Soft ref to a `Source.index` — app-enforced, no DB FK.
  citation?: number
}
export type Etymology = {
  summary: string
  firstAttested: { year: number; language: string }
  origin: { from: string; to: string; gloss: string }
  descent: EtymologyStage[]
}

export type AuthorExample = {
  author: string
  authorImageUrl?: StorageKey | null
  work?: string
  language: Locale
  isGenerated: boolean
  quote: string
}

export type CulturalTimelineEntry = { date: string; text: string }
export type CulturalGuide = {
  timeline: CulturalTimelineEntry[]
  forecast2030?: string
  notes?: string[]
}

export type RelatedTerm = { term: string; note?: string }
export type Relations = { synonyms: RelatedTerm[]; antonyms: RelatedTerm[]; family: string[] }

/** `languageName` is a free-text name ("French"), not the `Locale` enum. */
export type Translation = { languageName: string; term: string }

export const VISUAL_KINDS = ['hero', 'infographic', 'meme'] as const
export type VisualKind = (typeof VISUAL_KINDS)[number]
export const enumVisualKind = toEnum(VISUAL_KINDS)

export type Visual = {
  kind: VisualKind
  imageKey: StorageKey | null
  prompt: string
  caption?: string
  concept?: string
  width?: number
  height?: number
}
/** One hero, one infographic, N memes — not a flat `Visual[]`. */
export type Visuals = {
  hero: Visual | null
  infographic: Visual | null
  memes: Visual[]
}

export const SOURCE_TYPES = [
  'wiktionary',
  'wikipedia',
  'dictionary',
  'primary',
  'scholarly',
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]
export const enumSourceType = toEnum(SOURCE_TYPES)

export type Source = {
  index: number
  type: SourceType
  title: string
  url?: string
  retrievedAt?: string
  year?: number
  note?: string
}

export type SourceVersions = { model: string; promptHash: string; pipeline?: string }

export const FREQUENCY_BANDS = ['rare', 'uncommon', 'common', 'frequent'] as const
export type FrequencyBand = (typeof FREQUENCY_BANDS)[number]
export const enumFrequencyBand = toEnum(FREQUENCY_BANDS)

export type Frequency = {
  band: FrequencyBand
  trendNote?: string
  series?: { year: number; value: number }[]
  changeNote?: string
}
