/**
 * A Ready card for the `ready`-variant round-trip — the full `WordEntity` row (`id` + timestamps +
 * `sourceVersions` ride along). The timestamps are `Date` instances — the `timestamp` columns decode
 * via `Schema.Date` (`instanceOf(Date)`), whose in-memory encoded form is a `Date` (a separate JSON
 * codec handles the ISO-string wire form).
 */
export const sampleWord = {
  id: 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7',
  word: 'lacuna',
  language: 'en',
  coreDefinition: 'An unfilled space; a gap.',
  lexical: {
    partOfSpeech: 'noun',
    countable: true,
    plural: { primary: 'lacunae', also: ['lacunas'] },
    register: ['formal', 'literary'],
  },
  pronunciation: {
    ipa: '/ləˈkjuːnə/',
    respelling: 'luh-KYOO-nuh',
    audio: { uk: 'audio/lacuna-uk.mp3', us: null },
  },
  tiers: {
    quick: { body: 'A gap.', examples: [{ text: 'a lacuna in the records', register: 'neutral' }] },
    everyday: { title: 'Everyday', body: 'A missing part.', examples: [] },
    deep: { body: 'An unfilled space or interval.', examples: [] },
    cultural: { body: 'Used in manuscript studies.', examples: [] },
  },
  etymology: {
    summary: 'From Latin lacuna "pool, gap".',
    firstAttested: { year: 1663, language: 'English' },
    origin: { from: 'lacus', to: 'lacuna', gloss: 'lake → hollow' },
    descent: [
      {
        when: 'Classical Latin',
        form: 'lacuna',
        languageName: 'Latin',
        gloss: 'pit, gap',
        citation: 1,
      },
    ],
  },
  authorExamples: [
    {
      author: 'Virginia Woolf',
      work: 'The Waves',
      language: 'en',
      isGenerated: false,
      quote: '…a lacuna in time…',
      authorImageUrl: null,
    },
  ],
  culturalGuide: {
    timeline: [{ date: '17c', text: 'Adopted into English.' }],
    notes: ['Common in academic prose.'],
  },
  relations: {
    synonyms: [{ term: 'gap', note: 'general' }],
    antonyms: [{ term: 'fill' }],
    family: ['lacunar', 'lacunary'],
  },
  translations: [{ languageName: 'Russian', term: 'лакуна' }],
  visuals: {
    hero: {
      kind: 'hero',
      imageKey: 'img/lacuna-hero.png',
      prompt: 'an empty manuscript gap',
      width: 1024,
      height: 768,
    },
    infographic: null,
    memes: [{ kind: 'meme', imageKey: null, prompt: 'gap meme', caption: 'mind the lacuna' }],
  },
  sources: [
    {
      index: 1,
      type: 'wiktionary',
      title: 'lacuna',
      url: 'https://en.wiktionary.org/wiki/lacuna',
    },
  ],
  frequency: { band: 'uncommon', trendNote: 'stable', series: [{ year: 2000, value: 0.2 }] },
  sourceVersions: { model: 'mock', promptHash: 'deadbeef' },
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
}
