import { describe, expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { enumLanguage, enumVisualKind } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { Effect, Exit, Layer } from 'effect'
import { WordsRepo, WordsRepoLive } from '../src/index'

faker.seed(20260604)

const TestLayer = WordsRepoLive.pipe(Layer.provideMerge(TestDatabaseLive))
const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('WordsRepo.find', () => {
    it.effect('returns empty for an absent word, then the saved row after save', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        expect(yield* repo.find({ language: EN, word: 'lacuna' })).toHaveLength(0)

        const saved = yield* repo.save(
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

        const [found] = yield* repo.find({ language: EN, word: 'lacuna', limit: 1 })
        expect(found?.id).toBe(saved.id)
        expect(found?.coreDefinition).toBe('an unfilled space; a gap')
      }),
    )

    it.effect('filters by id/word/language (value or array), search prefix, and limit', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        yield* repo.save([
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
        expect(
          (yield* repo.find({ language: EN, search: 'LAC' })).map((r) => r.word).sort(),
        ).toEqual(['lacrimal', 'lacuna'])
        // limit caps the result.
        expect(yield* repo.find({ language: EN, limit: 1 })).toHaveLength(1)
        // by id.
        const [one] = yield* repo.find({ word: 'ephemeral' })
        expect((yield* repo.find({ id: one?.id ?? '' }))[0]?.word).toBe('ephemeral')
      }),
    )
  })

  describe('WordsRepo.save', () => {
    it.effect('is the upsert promotion: regen replaces in place on UNIQUE(word, language)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        const first = yield* repo.save(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'first generation' }),
        )
        const second = yield* repo.save(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'second generation' }),
        )
        expect(second.id).toBe(first.id)
        expect(second.coreDefinition).toBe('second generation')

        // Same word, other language ⇒ a distinct row.
        const ru = yield* repo.save(makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }))
        expect(ru.id).not.toBe(first.id)
        expect(yield* repo.find({ word: 'lacuna' })).toHaveLength(2)
      }),
    )

    it.effect('(array) inserts many atomically and returns a row per item', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        const rows = yield* repo.save([
          makeWordInsert({ word: 'lacuna', language: EN }),
          makeWordInsert({ word: 'ephemeral', language: EN }),
        ])
        expect(rows).toHaveLength(2)
        expect(new Set(rows.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
        expect(yield* repo.find({ language: EN })).toHaveLength(2)
      }),
    )

    it.effect('(array) is per-row, not atomic: a failing row fails, earlier rows persist', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        // (word, language) duplicates would just upsert, so force a real failure: a NOT NULL violation
        // on the second row. Each content is its own statement (no transaction), so the valid first
        // row is already saved when the second fails.
        const broken = makeWordInsert({ word: 'ephemeral', language: EN })
        // @ts-expect-error null violates the NOT NULL `core_definition` column — forces a mid-batch failure.
        broken.coreDefinition = null

        const exit = yield* Effect.exit(
          repo.save([makeWordInsert({ word: 'lacuna', language: EN }), broken]),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        // The valid first insert committed before the second row failed — not rolled back.
        const persisted = yield* repo.find({})
        expect(persisted.map((r) => r.word)).toEqual(['lacuna'])
      }),
    )

    it.effect('(array) handles rows that carry different optional columns', () =>
      Effect.gen(function* () {
        yield* resetDb
        const repo = yield* WordsRepo

        // Heterogeneous batch: one content carries `frequency`, the other omits the key entirely. A
        // single shared conflict SET could not serve both; per-row derives each SET from its own keys.
        const withFreq = makeWordInsert({ word: 'lacuna', language: EN })
        const withoutFreq = makeWordInsert({ word: 'ephemeral', language: EN })
        delete withoutFreq.frequency

        const rows = yield* repo.save([withFreq, withoutFreq])
        expect(new Set(rows.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
        expect(yield* repo.find({ language: EN })).toHaveLength(2)
      }),
    )
  })
})
