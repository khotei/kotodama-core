import { expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { Effect } from 'effect'
import { makeWordInsert } from '../src/factories'
import { DB, enumLanguage, enumVisualKind, wordsTable } from '../src/index'
import { resetDb, TestDatabaseLive } from '../src/testing'

// `resetDb` runs inside the shared `it.layer` runtime (an `afterEach` would spin up a second
// container). See @.claude/rules/testing.md.
faker.seed(20260604)

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  it.effect('words is pristine: identity + content, no status', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const [word] = yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ word: 'lacuna', language: enumLanguage.en }))
        .returning()
      if (!word) throw new Error('insert returned no row')

      expect(word).toMatchObject({ word: 'lacuna', language: enumLanguage.en })
      expect(typeof word.id).toBe('string')
      expect(word.createdAt).toBeInstanceOf(Date)
      expect(word.updatedAt).toBeInstanceOf(Date)
      expect(word).not.toHaveProperty('status')
      expect(word).not.toHaveProperty('explanation')
      expect(word).not.toHaveProperty('term')
      expect(word).not.toHaveProperty('locale')
    }),
  )

  it.effect('UNIQUE(word, language) keeps a word unique per language', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ word: 'lacuna', language: enumLanguage.en }))
      yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ word: 'lacuna', language: enumLanguage.en }))
        .onConflictDoNothing()
      yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }))

      const rows = yield* db.select().from(wordsTable)
      expect(rows).toHaveLength(2)
    }),
  )

  it.effect('the full realistic §5 JSONB round-trips off $inferSelect', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const [word] = yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ coreDefinition: 'a deliberate gap in a text' }))
        .returning()
      if (!word) throw new Error('insert returned no row')

      expect(word.coreDefinition).toBe('a deliberate gap in a text')
      expect(typeof word.tiers.quick.body).toBe('string')
      expect(word.tiers.deep.examples.length).toBeGreaterThan(0)
      expect(word.visuals.hero?.kind).toBe(enumVisualKind.hero)
      expect(word.visuals.infographic?.kind).toBe(enumVisualKind.infographic)
      expect(word.visuals.memes.length).toBeGreaterThan(0)
      expect(word.sources.length).toBeGreaterThan(0)
      expect(word.authorExamples.length).toBeGreaterThan(0)
      expect(word.translations[0]?.language).toBe(enumLanguage.fr)
      expect(word.etymology.descent.length).toBeGreaterThan(0)
      expect(word.sourceVersions.model).toBeDefined()
    }),
  )

  it.effect('array content defaults to []; frequency is the lone nullable column', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const full = makeWordInsert({ word: 'lacuna', language: enumLanguage.en })
      const { authorExamples: _a, translations: _t, sources: _s, frequency: _f, ...required } = full
      const [word] = yield* db.insert(wordsTable).values(required).returning()
      if (!word) throw new Error('insert returned no row')

      expect(word.authorExamples).toEqual([])
      expect(word.translations).toEqual([])
      expect(word.sources).toEqual([])
      expect(word.frequency).toBeNull()
    }),
  )
})
