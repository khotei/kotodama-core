import {
  type AuthorExample,
  type CulturalGuide,
  type Etymology,
  enumFrequencyBand,
  enumSourceType,
  enumVisualKind,
  enumWordJobStage,
  type Frequency,
  type Language,
  type Lexical,
  type Pronunciation,
  type Relations,
  type Source,
  type StageResult,
  type Tier,
  type Tiers,
  type Translation,
  type Visual,
  type Visuals,
  type WordJobStage,
} from '@lexiai/database'

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
 * The per-stage content slices. Keys are disjoint across stages so the worker assembles a full
 * `Word` by merging all six — mirroring the real per-stage write at the swap boundary.
 */
const stageContent: Record<WordJobStage, (word: string, language: Language) => StageResult> = {
  [enumWordJobStage.fetch_source]: (word) => ({
    coreDefinition: `${cap(word)}: a deliberately mock definition of “${word}”.`,
    lexical: lexical(word),
    pronunciation: pronunciation(word),
    sources: sources(word),
  }),
  [enumWordJobStage.enrich_etymology]: (word) => ({ etymology: etymology(word) }),
  [enumWordJobStage.enrich_tiers]: (word) => ({
    tiers: tiers(word),
    relations: relations(word),
    translations: translations(word),
  }),
  [enumWordJobStage.enrich_authors]: (word, language) => ({
    authorExamples: authorExamples(word, language),
    culturalGuide: culturalGuide(word),
  }),
  [enumWordJobStage.enrich_visuals]: (word) => ({ visuals: visuals(word) }),
  [enumWordJobStage.final_review]: () => ({ frequency: frequency() }),
}

/** The `StageResult` a given pass writes for `(word, language)`. Pure and deterministic. */
export const mockStageContent = (
  stage: WordJobStage,
  word: string,
  language: Language,
): StageResult => stageContent[stage](word, language)
