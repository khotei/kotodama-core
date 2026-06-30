import {
  type AuthorExample,
  type CulturalGuide,
  type Etymology,
  enumFrequencyBand,
  enumSourceType,
  enumVisualKind,
  type Frequency,
  type Language,
  type Lexical,
  type Pronunciation,
  type Relations,
  type Source,
  type Tier,
  type Tiers,
  type Translation,
  type Visual,
  type Visuals,
  type WordContent,
  type WordJobStage,
} from '@lexiai/database'
import { STAGE_SLICES, type StageSlice } from './stage-slices'

/**
 * Deterministic, schema-valid mock word content, keyed only by the word. No `faker`, clock, or
 * randomness — `@lexiai/database/factories` pulls faker (a devDependency that must stay out of prod
 * source), and a reproducible mock is what tests and the local demo want. `makeWordInsert` is the
 * *shape* model:
 * every field below mirrors a `words.content` shape and decodes against the `WordEntity`
 * (`@lexiai/database`). The per-stage slices are disjoint and collectively cover the entity (minus
 * the build identity `word`/`language`, which the worker supplies).
 */

const cap = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

const storageKey = (word: string, kind: string): string => `mock/${kind}/${word}.bin`

const lexical = (word: string): Lexical => ({
  partOfSpeech: 'noun',
  countable: true,
  plural: { primary: `${word}s`, also: [`${word}es`] },
  register: ['literary', 'formal'],
})

const pronunciation = (word: string): Pronunciation => ({
  ipa: `/ˈ${word}/`,
  respelling: word.toUpperCase(),
  audio: { uk: storageKey(word, 'audio/uk'), us: storageKey(word, 'audio/us') },
})

const tier = (word: string, depth: string): Tier => ({
  title: `${cap(depth)} sense of ${word}`,
  body: `A ${depth} reading of “${word}”.`,
  examples: [
    { text: `The ${word} was unmistakable.`, register: 'literary' },
    { text: `She noted the ${word} at once.`, register: 'formal' },
  ],
})

const tiers = (word: string): Tiers => ({
  quick: tier(word, 'quick'),
  everyday: tier(word, 'everyday'),
  deep: tier(word, 'deep'),
  cultural: tier(word, 'cultural'),
})

const etymology = (word: string): Etymology => ({
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

const authorExamples = (word: string, language: Language): AuthorExample[] => [
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

const culturalGuide = (word: string): CulturalGuide => ({
  timeline: [
    { date: '1900', text: `“${word}” enters common use.` },
    { date: '2000', text: `“${word}” spreads online.` },
  ],
  forecast2030: `“${word}” holds steady through 2030.`,
  notes: [`A usage note on ${word}.`],
})

const relations = (word: string): Relations => ({
  synonyms: [{ term: `${word}-like`, note: 'near synonym' }],
  antonyms: [{ term: `un-${word}` }],
  family: [`${word}ness`, `${word}ful`],
})

const translations = (word: string): Translation[] => [
  { languageName: 'French', term: `${word} (fr)` },
  { languageName: 'German', term: `${word} (de)` },
]

const visual = (word: string, kind: Visual['kind']): Visual => ({
  kind,
  imageKey: storageKey(word, `visuals/${kind}`),
  prompt: `A ${kind} illustrating “${word}”.`,
  caption: `${cap(kind)} for ${word}`,
  concept: `${word} as ${kind}`,
  width: 1024,
  height: 1024,
})

const visuals = (word: string): Visuals => ({
  hero: visual(word, enumVisualKind.hero),
  infographic: visual(word, enumVisualKind.infographic),
  memes: [visual(word, enumVisualKind.meme)],
})

const sources = (word: string): Source[] => [
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

const frequency = (): Frequency => ({
  band: enumFrequencyBand.uncommon,
  trendNote: 'steady use over the last decade',
  series: [
    { year: 2020, value: 0.2 },
    { year: 2021, value: 0.25 },
    { year: 2022, value: 0.3 },
  ],
  changeNote: 'slight rise',
})

/**
 * The full mock `WordContent` — every field a `words` row carries. Typed as {@link WordContent}, so a
 * new content field fails `tsc` here until the mock provides it. {@link mockStageContent} slices this
 * through {@link STAGE_SLICES} instead of re-listing which keys each stage owns, so the mock can't drift
 * from the real engine's per-stage partition.
 */
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

/**
 * The typed {@link StageSlice} a given pass writes for `(word, language)` — the stage's keys
 * ({@link STAGE_SLICES}, the real engine's own partition) picked off {@link fullMockContent}. Pure and
 * deterministic. The cast bridges the runtime key-pick to the static slice type; the keys come from
 * `STAGE_SLICES[stage]` itself, so the pick always yields exactly that stage's slice.
 */
export const mockStageContent = <S extends WordJobStage>(
  stage: S,
  word: string,
  language: Language,
): StageSlice<S> => {
  const content = fullMockContent(word, language) as Record<string, unknown>
  const keys = Object.keys(STAGE_SLICES[stage].fields)
  return Object.fromEntries(keys.map((key) => [key, content[key]])) as StageSlice<S>
}
