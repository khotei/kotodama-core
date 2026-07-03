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
  it.effect('a words row carries identity + status + content', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const [word] = yield* db
        .insert(wordsTable)
        .values(makeWordInsert({ word: 'lacuna', language: enumLanguage.en }))
        .returning()
      if (!word) throw new Error('insert returned no row')

      expect(word).toMatchObject({ word: 'lacuna', language: enumLanguage.en, status: 'succeeded' })
      expect(typeof word.id).toBe('string')
      expect(word.createdAt).toBeInstanceOf(Date)
      expect(word.updatedAt).toBeInstanceOf(Date)
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
      expect(typeof word.tiers?.quick.body).toBe('string')
      expect(word.tiers?.deep.examples.length).toBeGreaterThan(0)
      expect(word.visuals?.hero?.kind).toBe(enumVisualKind.hero)
      expect(word.visuals?.infographic?.kind).toBe(enumVisualKind.infographic)
      expect(word.visuals?.memes.length).toBeGreaterThan(0)
      expect(word.sources?.length).toBeGreaterThan(0)
      expect(word.authorExamples?.length).toBeGreaterThan(0)
      expect(word.translations?.[0]?.language).toBe(enumLanguage.fr)
      expect(word.etymology?.descent.length).toBeGreaterThan(0)
      expect(word.sourceVersions?.model).toBeDefined()
    }),
  )

  it.effect('a pending row may carry NULL content; frequency stays nullable', () =>
    Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB

      const [word] = yield* db
        .insert(wordsTable)
        .values({ word: 'lacuna', language: enumLanguage.en, status: 'pending' })
        .returning()
      if (!word) throw new Error('insert returned no row')

      expect(word.status).toBe('pending')
      expect(word.coreDefinition).toBeNull()
      expect(word.authorExamples).toBeNull()
      expect(word.frequency).toBeNull()
    }),
  )
})
