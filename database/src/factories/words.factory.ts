import { faker } from '@faker-js/faker'
import { enumAsyncJobStatus } from '../../schema/primitives/async-job-status'
import { LANGUAGES } from '../../schema/primitives/language'
import { WORD_BUILD_STAGES } from '../../schema/words/word-build-stages.entity'
import type {
  AuthorExampleEntity,
  BuildProvenanceEntity,
  CulturalGuideEntity,
  EtymologyEntity,
  EtymologyWordBuildStageEntity,
  FrequencyEntity,
  LexicalEntity,
  PronunciationEntity,
  RelationsEntity,
  SourceEntity,
  StorageKey,
  TierEntity,
  TiersEntity,
  TranslationEntity,
  VisualEntity,
  VisualsEntity,
} from '../../schema/words/words.entity'
import type { WordInsert } from '../../schema/words/words.table'
import { enumVisualKind, FREQUENCY_BANDS, SOURCE_TYPES } from '../../schema/words/words.values'

function makeStorageKey(prefix: string): StorageKey {
  return `${prefix}/${faker.string.uuid()}.bin`
}

const REGISTERS = ['formal', 'informal', 'literary', 'technical', 'slang'] as const

function makeLexical(): LexicalEntity {
  return {
    partOfSpeech: faker.helpers.arrayElement(['noun', 'verb', 'adjective', 'adverb']),
    countable: faker.datatype.boolean(),
    plural: { primary: faker.lorem.word(), also: [faker.lorem.word()] },
    register: faker.helpers.arrayElements(REGISTERS, { min: 1, max: 2 }),
  }
}

function makePronunciation(): PronunciationEntity {
  return {
    ipa: `/${faker.lorem.word()}/`,
    respelling: faker.lorem.word(),
    audio: { uk: makeStorageKey('audio/uk'), us: makeStorageKey('audio/us') },
  }
}

function makeTier(): TierEntity {
  return {
    title: faker.lorem.words(2),
    body: faker.lorem.sentence(),
    examples: Array.from({ length: 2 }, () => ({
      text: faker.lorem.sentence(),
      register: faker.helpers.arrayElement(REGISTERS),
    })),
  }
}

function makeTiers(): TiersEntity {
  return {
    quick: makeTier(),
    everyday: makeTier(),
    deep: makeTier(),
    cultural: makeTier(),
  }
}

function makeEtymologyStage(citation?: number): EtymologyWordBuildStageEntity {
  return {
    when: `${faker.number.int({ min: 800, max: 1900 })}`,
    form: faker.lorem.word(),
    languageName: faker.helpers.arrayElement(['Latin', 'Old French', 'Proto-Germanic', 'Greek']),
    gloss: faker.lorem.words(3),
    citation,
  }
}

function makeEtymology(sourceCount: number): EtymologyEntity {
  return {
    summary: faker.lorem.sentence(),
    firstAttested: {
      year: faker.number.int({ min: 1200, max: 1800 }),
      language: faker.helpers.arrayElement(['Latin', 'Old French', 'Greek']),
    },
    origin: { from: faker.lorem.word(), to: faker.lorem.word(), gloss: faker.lorem.words(3) },
    // `citation` soft-refs a SourceEntity.index — app-enforced only, no FK.
    descent: Array.from({ length: 2 }, () =>
      makeEtymologyStage(faker.number.int({ min: 0, max: Math.max(0, sourceCount - 1) })),
    ),
  }
}

function makeAuthorExample(): AuthorExampleEntity {
  return {
    author: faker.person.fullName(),
    authorImageUrl: makeStorageKey('authors'),
    work: faker.lorem.words(3),
    language: faker.helpers.arrayElement(LANGUAGES),
    isGenerated: faker.datatype.boolean(),
    quote: faker.lorem.sentence(),
  }
}

function makeCulturalGuide(): CulturalGuideEntity {
  return {
    timeline: Array.from({ length: 2 }, () => ({
      date: `${faker.number.int({ min: 1900, max: 2025 })}`,
      text: faker.lorem.sentence(),
    })),
    forecast2030: faker.lorem.sentence(),
    notes: [faker.lorem.sentence()],
  }
}

function makeRelations(): RelationsEntity {
  return {
    synonyms: [{ term: faker.lorem.word(), note: faker.lorem.words(2) }],
    antonyms: [{ term: faker.lorem.word() }],
    family: [faker.lorem.word(), faker.lorem.word()],
  }
}

function makeTranslations(): TranslationEntity[] {
  return [
    { language: 'fr', term: faker.lorem.word() },
    { language: 'de', term: faker.lorem.word() },
  ]
}

function makeVisual(kind: VisualEntity['kind']): VisualEntity {
  return {
    kind,
    imageKey: makeStorageKey('visuals'),
    prompt: faker.lorem.sentence(),
    caption: faker.lorem.words(4),
    concept: faker.lorem.words(2),
    width: 1024,
    height: 1024,
  }
}

function makeVisuals(): VisualsEntity {
  return {
    hero: makeVisual(enumVisualKind.hero),
    infographic: makeVisual(enumVisualKind.infographic),
    memes: Array.from({ length: 2 }, () => makeVisual(enumVisualKind.meme)),
  }
}

function makeSources(): SourceEntity[] {
  return Array.from({ length: 3 }, (_, index) => ({
    index,
    type: faker.helpers.arrayElement(SOURCE_TYPES),
    title: faker.lorem.words(4),
    url: faker.internet.url(),
    retrievedAt: faker.date.past().toISOString(),
    year: faker.number.int({ min: 1990, max: 2025 }),
    note: faker.lorem.words(3),
  }))
}

function makeFrequency(): FrequencyEntity {
  return {
    band: faker.helpers.arrayElement(FREQUENCY_BANDS),
    trendNote: faker.lorem.sentence(),
    series: Array.from({ length: 3 }, (_, i) => ({
      year: 2020 + i,
      value: faker.number.float({ min: 0, max: 1, fractionDigits: 3 }),
    })),
    changeNote: faker.lorem.words(3),
  }
}

/**
 * Complete `words` insert; deterministic under `faker.seed(n)`. Defaults `status='succeeded'` with all
 * content populated — a valid ready row under the CHECK. Override `status` (and drop content) to model
 * the `pending`/`running`/`failed` lifecycle states. `frequency` is populated — override to `null` for
 * the not-yet-analyzed state.
 */
export function makeWordInsert(overrides: Partial<WordInsert> = {}): WordInsert {
  const sources = makeSources()
  return {
    word: faker.lorem.word(),
    language: faker.helpers.arrayElement(LANGUAGES),
    status: enumAsyncJobStatus.succeeded,
    stages: WORD_BUILD_STAGES.map((stage) => ({ stage, status: enumAsyncJobStatus.succeeded })),
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
    provenance: {
      model: faker.helpers.arrayElement(['gpt-4o', 'gpt-4o-mini']),
      promptHash: faker.string.alphanumeric(16),
      pipeline: `v${faker.number.int({ min: 1, max: 3 })}`,
    } satisfies BuildProvenanceEntity,
    frequency: makeFrequency(),
    ...overrides,
  }
}
