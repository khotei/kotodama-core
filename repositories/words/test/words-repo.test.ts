import { expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { enumLanguage, enumVisualKind } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { Effect, Exit, Layer, Option } from 'effect'
import { WordNotFoundError, WordsRepo, WordsRepoLive } from '../src/index'

faker.seed(20260604)

const TestLayer = WordsRepoLive.pipe(Layer.provideMerge(TestDatabaseLive))
const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('findOne → None for an absent word; Some after create', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* WordsRepo

      expect(Option.isNone(yield* repo.findOne({ language: EN, word: 'lacuna' }))).toBe(true)

      const saved = yield* repo.create(
        makeWordInsert({
          word: 'lacuna',
          language: EN,
          coreDefinition: 'an unfilled space; a gap',
        }),
      )
      expect(saved.word).toBe('lacuna')
      expect(typeof saved.id).toBe('string')
      // Typed jsonb readable straight off the row ($inferSelect keeps $type).
      expect(saved.visuals.hero?.kind).toBe(enumVisualKind.hero)

      const found = yield* repo.findOne({ language: EN, word: 'lacuna' })
      expect(Option.isSome(found)).toBe(true)
      if (Option.isSome(found)) {
        expect(found.value.id).toBe(saved.id)
        expect(found.value.coreDefinition).toBe('an unfilled space; a gap')
      }
    }),
  )

  it.effect(
    'create is the upsert promotion: regen replaces in place on UNIQUE(word, language)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        const first = yield* repo.create(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'first generation' }),
        )
        const second = yield* repo.create(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'second generation' }),
        )
        expect(second.id).toBe(first.id)
        expect(second.coreDefinition).toBe('second generation')

        // Same word, other language ⇒ a distinct row.
        const ru = yield* repo.create(makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }))
        expect(ru.id).not.toBe(first.id)
        expect(yield* repo.find({ word: 'lacuna' })).toHaveLength(2)
      }),
  )

  it.effect('create (array) inserts many atomically and returns a row per item', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* WordsRepo

      const rows = yield* repo.create([
        makeWordInsert({ word: 'lacuna', language: EN }),
        makeWordInsert({ word: 'ephemeral', language: EN }),
      ])
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
      expect(yield* repo.find({ language: EN })).toHaveLength(2)
    }),
  )

  it.effect('create (array) is atomic: a failing row rolls the whole batch back', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* WordsRepo

      // (word, language) duplicates would just upsert (last wins), so force a real failure: a NOT NULL
      // violation on the second row must roll back the first (valid) insert with the transaction.
      const broken = makeWordInsert({ word: 'ephemeral', language: EN })
      // @ts-expect-error null violates the NOT NULL `core_definition` column — forces a mid-batch failure.
      broken.coreDefinition = null

      const exit = yield* Effect.exit(
        repo.create([makeWordInsert({ word: 'lacuna', language: EN }), broken]),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      // The valid first insert rolled back with the failed batch — nothing persisted.
      expect(yield* repo.find({})).toHaveLength(0)
    }),
  )

  it.effect('find filters by id/word/language (value or array), search prefix, and limit', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* WordsRepo

      yield* repo.create([
        makeWordInsert({ word: 'lacuna', language: EN }),
        makeWordInsert({ word: 'lacrimal', language: EN }),
        makeWordInsert({ word: 'ephemeral', language: EN }),
        makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }),
      ])

      // empty query lists every row.
      expect(yield* repo.find({})).toHaveLength(4)
      // language filter.
      expect(yield* repo.find({ language: EN })).toHaveLength(3)
      // word as an array.
      expect(yield* repo.find({ word: ['lacuna', 'ephemeral'] })).toHaveLength(3)
      // case-insensitive prefix search on `word`.
      expect((yield* repo.find({ language: EN, search: 'LAC' })).map((r) => r.word).sort()).toEqual(
        ['lacrimal', 'lacuna'],
      )
      // limit caps the result.
      expect(yield* repo.find({ language: EN, limit: 1 })).toHaveLength(1)
      // by id.
      const [one] = yield* repo.find({ word: 'ephemeral' })
      expect((yield* repo.find({ id: one?.id ?? '' }))[0]?.word).toBe('ephemeral')
    }),
  )

  it.effect('patch updates an existing word; an absent word fails WordNotFoundError', () =>
    Effect.gen(function* () {
      yield* resetDb
      const repo = yield* WordsRepo

      yield* repo.create(makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'old' }))
      const patched = yield* repo.patch(EN, 'lacuna', { coreDefinition: 'new' })
      expect(patched.coreDefinition).toBe('new')

      const error = yield* repo.patch(EN, 'absent', { coreDefinition: 'x' }).pipe(Effect.flip)
      expect(error).toBeInstanceOf(WordNotFoundError)
      if (error instanceof WordNotFoundError) expect(error.word).toBe('absent')
    }),
  )
})
