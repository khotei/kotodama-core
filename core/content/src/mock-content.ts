import {
  type AuthorExampleEntity,
  type CulturalGuideEntity,
  type EtymologyEntity,
  enumFrequencyBand,
  enumSourceType,
  enumVisualKind,
  type FrequencyEntity,
  type Language,
  type LexicalEntity,
  type PronunciationEntity,
  type RelationsEntity,
  type SourceEntity,
  type TierEntity,
  type TiersEntity,
  type TranslationEntity,
  type VisualEntity,
  type VisualsEntity,
  type WordJobStage,
} from '@kotodama/core/database'
import { STAGE_SLICES, type StageSlice } from './stage-slices'
import type { WordContent } from './word-content.schema'

/**
 * Deterministic, schema-valid mock content keyed only by the word — no faker (a devDependency that
 * must stay out of prod source), no clock, no randomness, so tests and the local demo reproduce.
 */

const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

const storageKey = (word: string, kind: string): string => `mock/${kind}/${word}.bin`

const lexical = (word: string): LexicalEntity => ({
  partOfSpeech: 'noun',
  countable: true,
  plural: { primary: `${word}s`, also: [`${word}es`] },
  register: ['literary', 'formal'],
})

const pronunciation = (word: string): PronunciationEntity => ({
  ipa: `/ˈ${word}/`,
  respelling: word.toUpperCase(),
  audio: { uk: storageKey(word, 'audio/uk'), us: storageKey(word, 'audio/us') },
})

const tier = (word: string, depth: string): TierEntity => ({
  title: `${cap(depth)} sense of ${word}`,
  body: `A ${depth} reading of “${word}”.`,
  examples: [
    { text: `The ${word} was unmistakable.`, register: 'literary' },
    { text: `She noted the ${word} at once.`, register: 'formal' },
  ],
})

const tiers = (word: string): TiersEntity => ({
  quick: tier(word, 'quick'),
  everyday: tier(word, 'everyday'),
  deep: tier(word, 'deep'),
  cultural: tier(word, 'cultural'),
})

const etymology = (word: string): EtymologyEntity => ({
  summary: `“${word}” descends through several attested forms.`,
  firstAttested: { year: 1500, language: 'Latin' },
  origin: { from: `${word}-`, to: word, gloss: `relating to ${word}` },
  descent: [
    {
      when: '1500',
      form: `${word}us`,
      languageName: 'Latin',
      gloss: `root of ${word}`,
      citation: 0,
    },
    { when: '1600', form: word, languageName: 'Old French', gloss: `early ${word}`, citation: 1 },
  ],
})

const authorExamples = (word: string, language: Language): AuthorExampleEntity[] => [
  {
    author: 'A. Writer',
    authorImageUrl: storageKey(word, 'authors'),
    work: `On ${cap(word)}`,
    language,
    isGenerated: false,
    quote: `Consider the ${word}, in all its weight.`,
  },
  {
    author: 'B. Poet',
    authorImageUrl: storageKey(word, 'authors'),
    work: `${cap(word)} Verses`,
    language,
    isGenerated: true,
    quote: `O ${word}, you linger still.`,
  },
]

const culturalGuide = (word: string): CulturalGuideEntity => ({
  timeline: [
    { date: '1900', text: `“${word}” enters common use.` },
    { date: '2000', text: `“${word}” spreads online.` },
  ],
  forecast2030: `“${word}” holds steady through 2030.`,
  notes: [`A usage note on ${word}.`],
})

const relations = (word: string): RelationsEntity => ({
  synonyms: [{ term: `${word}-like`, note: 'near synonym' }],
  antonyms: [{ term: `un-${word}` }],
  family: [`${word}ness`, `${word}ful`],
})

const translations = (word: string): TranslationEntity[] => [
  { language: 'fr', term: `${word} (fr)` },
  { language: 'de', term: `${word} (de)` },
]

const visual = (word: string, kind: VisualEntity['kind']): VisualEntity => ({
  kind,
  imageKey: storageKey(word, `visuals/${kind}`),
  prompt: `A ${kind} illustrating “${word}”.`,
  caption: `${cap(kind)} for ${word}`,
  concept: `${word} as ${kind}`,
  width: 1024,
  height: 1024,
})

const visuals = (word: string): VisualsEntity => ({
  hero: visual(word, enumVisualKind.hero),
  infographic: visual(word, enumVisualKind.infographic),
  memes: [visual(word, enumVisualKind.meme)],
})

const sources = (word: string): SourceEntity[] => [
  {
    index: 0,
    type: enumSourceType.wiktionary,
    title: `Wiktionary: ${word}`,
    url: `https://en.wiktionary.org/wiki/${word}`,
    retrievedAt: '2026-01-01T00:00:00.000Z',
    year: 2026,
    note: 'primary gloss',
  },
  { index: 1, type: enumSourceType.dictionary, title: `Dictionary entry: ${word}`, year: 2020 },
]

const frequency = (): FrequencyEntity => ({
  band: enumFrequencyBand.uncommon,
  trendNote: 'steady use over the last decade',
  series: [
    { year: 2020, value: 0.2 },
    { year: 2021, value: 0.25 },
    { year: 2022, value: 0.3 },
  ],
  changeNote: 'slight rise',
})

// Typed as WordContent so a new content field fails tsc here until the mock provides it.
const fullMockContent = (word: string, language: Language): WordContent => ({
  coreDefinition: `${cap(word)}: a deliberately mock definition of “${word}”.`,
  lexical: lexical(word),
  pronunciation: pronunciation(word),
  sources: sources(word),
  etymology: etymology(word),
  tiers: tiers(word),
  relations: relations(word),
  translations: translations(word),
  authorExamples: authorExamples(word, language),
  culturalGuide: culturalGuide(word),
  visuals: visuals(word),
  frequency: frequency(),
})

// Sliced through STAGE_SLICES (never a re-listed partition), so the mock can't drift from the
// real engine's stage → keys mapping; the cast bridges the runtime pick to the static slice type.
export const mockStageContent = <S extends WordJobStage>(
  stage: S,
  word: string,
  language: Language,
): StageSlice<S> => {
  const content = fullMockContent(word, language) as Record<string, unknown>
  const keys = Object.keys(STAGE_SLICES[stage].fields)
  return Object.fromEntries(keys.map((key) => [key, content[key]])) as StageSlice<S>
}
