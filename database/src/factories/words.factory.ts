import { faker } from '@faker-js/faker'
import { languageEnum } from '../../schema/enums'
import {
  type AuthorExample,
  type CulturalGuide,
  type Etymology,
  type EtymologyStage,
  enumVisualKind,
  FREQUENCY_BANDS,
  type Frequency,
  type Lexical,
  type Pronunciation,
  type Relations,
  SOURCE_TYPES,
  type Source,
  type SourceVersions,
  type StorageKey,
  type Tier,
  type Tiers,
  type Translation,
  type Visual,
  type Visuals,
} from '../../schema/words/words.content-types'
import type { wordsTable } from '../../schema/words/words.table'

type WordInsert = typeof wordsTable.$inferInsert

const makeStorageKey = (prefix: string): StorageKey => `${prefix}/${faker.string.uuid()}.bin`

const REGISTERS = ['formal', 'informal', 'literary', 'technical', 'slang'] as const

const makeLexical = (): Lexical => ({
  partOfSpeech: faker.helpers.arrayElement(['noun', 'verb', 'adjective', 'adverb']),
  countable: faker.datatype.boolean(),
  plural: { primary: faker.lorem.word(), also: [faker.lorem.word()] },
  register: faker.helpers.arrayElements(REGISTERS, { min: 1, max: 2 }),
})

const makePronunciation = (): Pronunciation => ({
  ipa: `/${faker.lorem.word()}/`,
  respelling: faker.lorem.word(),
  audio: { uk: makeStorageKey('audio/uk'), us: makeStorageKey('audio/us') },
})

const makeTier = (): Tier => ({
  title: faker.lorem.words(2),
  body: faker.lorem.sentence(),
  examples: Array.from({ length: 2 }, () => ({
    text: faker.lorem.sentence(),
    register: faker.helpers.arrayElement(REGISTERS),
  })),
})

const makeTiers = (): Tiers => ({
  quick: makeTier(),
  everyday: makeTier(),
  deep: makeTier(),
  cultural: makeTier(),
})

const makeEtymologyStage = (citation?: number): EtymologyStage => ({
  when: `${faker.number.int({ min: 800, max: 1900 })}`,
  form: faker.lorem.word(),
  languageName: faker.helpers.arrayElement(['Latin', 'Old French', 'Proto-Germanic', 'Greek']),
  gloss: faker.lorem.words(3),
  citation,
})

const makeEtymology = (sourceCount: number): Etymology => ({
  summary: faker.lorem.sentence(),
  firstAttested: {
    year: faker.number.int({ min: 1200, max: 1800 }),
    language: faker.helpers.arrayElement(['Latin', 'Old French', 'Greek']),
  },
  origin: { from: faker.lorem.word(), to: faker.lorem.word(), gloss: faker.lorem.words(3) },
  // `citation` soft-refs a Source.index — app-enforced only, no FK.
  descent: Array.from({ length: 2 }, () =>
    makeEtymologyStage(faker.number.int({ min: 0, max: Math.max(0, sourceCount - 1) })),
  ),
})

const makeAuthorExample = (): AuthorExample => ({
  author: faker.person.fullName(),
  authorImageUrl: makeStorageKey('authors'),
  work: faker.lorem.words(3),
  language: faker.helpers.arrayElement(languageEnum.enumValues),
  isGenerated: faker.datatype.boolean(),
  quote: faker.lorem.sentence(),
})

const makeCulturalGuide = (): CulturalGuide => ({
  timeline: Array.from({ length: 2 }, () => ({
    date: `${faker.number.int({ min: 1900, max: 2025 })}`,
    text: faker.lorem.sentence(),
  })),
  forecast2030: faker.lorem.sentence(),
  notes: [faker.lorem.sentence()],
})

const makeRelations = (): Relations => ({
  synonyms: [{ term: faker.lorem.word(), note: faker.lorem.words(2) }],
  antonyms: [{ term: faker.lorem.word() }],
  family: [faker.lorem.word(), faker.lorem.word()],
})

const makeTranslations = (): Translation[] => [
  { languageName: 'French', term: faker.lorem.word() },
  { languageName: 'German', term: faker.lorem.word() },
]

const makeVisual = (kind: Visual['kind']): Visual => ({
  kind,
  imageKey: makeStorageKey('visuals'),
  prompt: faker.lorem.sentence(),
  caption: faker.lorem.words(4),
  concept: faker.lorem.words(2),
  width: 1024,
  height: 1024,
})

const makeVisuals = (): Visuals => ({
  hero: makeVisual(enumVisualKind.hero),
  infographic: makeVisual(enumVisualKind.infographic),
  memes: Array.from({ length: 2 }, () => makeVisual(enumVisualKind.meme)),
})

const makeSources = (): Source[] =>
  Array.from({ length: 3 }, (_, index) => ({
    index,
    type: faker.helpers.arrayElement(SOURCE_TYPES),
    title: faker.lorem.words(4),
    url: faker.internet.url(),
    retrievedAt: faker.date.past().toISOString(),
    year: faker.number.int({ min: 1990, max: 2025 }),
    note: faker.lorem.words(3),
  }))

const makeFrequency = (): Frequency => ({
  band: faker.helpers.arrayElement(FREQUENCY_BANDS),
  trendNote: faker.lorem.sentence(),
  series: Array.from({ length: 3 }, (_, i) => ({
    year: 2020 + i,
    value: faker.number.float({ min: 0, max: 1, fractionDigits: 3 }),
  })),
  changeNote: faker.lorem.words(3),
})

/**
 * Complete `words` insert; deterministic under `faker.seed(n)`. `frequency` is
 * populated — override to `null` for the not-yet-analyzed state.
 */
export const makeWordInsert = (overrides: Partial<WordInsert> = {}): WordInsert => {
  const sources = makeSources()
  return {
    word: faker.lorem.word(),
    language: faker.helpers.arrayElement(languageEnum.enumValues),
    coreDefinition: faker.lorem.sentence(),
    lexical: makeLexical(),
    pronunciation: makePronunciation(),
    tiers: makeTiers(),
    etymology: makeEtymology(sources.length),
    authorExamples: Array.from({ length: 2 }, makeAuthorExample),
    culturalGuide: makeCulturalGuide(),
    relations: makeRelations(),
    translations: makeTranslations(),
    visuals: makeVisuals(),
    sources,
    sourceVersions: {
      model: faker.helpers.arrayElement(['gpt-4o', 'gpt-4o-mini']),
      promptHash: faker.string.alphanumeric(16),
      pipeline: `v${faker.number.int({ min: 1, max: 3 })}`,
    } satisfies SourceVersions,
    frequency: makeFrequency(),
    ...overrides,
  }
}
