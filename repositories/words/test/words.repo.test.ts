import { describe, expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { enumLanguage, enumVisualKind } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { Effect, Exit, Option } from 'effect'
import { selectWord, selectWords, upsertWords } from '../src/index'

faker.seed(20260604)

const TestLayer = TestDatabaseLive
const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('selectWords', () => {
    it.effect('returns empty for an absent word, then the saved row after save', () =>
      Effect.gen(function* () {
        yield* resetDb

        expect(yield* selectWords({ language: EN, word: 'lacuna' })).toHaveLength(0)

        const saved = yield* upsertWords(
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

        const [found] = yield* selectWords({ language: EN, word: 'lacuna', limit: 1 })
        expect(found?.id).toBe(saved.id)
        expect(found?.coreDefinition).toBe('an unfilled space; a gap')
      }),
    )

    it.effect('filters by id/word/language (value or array), search prefix, and limit', () =>
      Effect.gen(function* () {
        yield* resetDb

        yield* upsertWords([
          makeWordInsert({ word: 'lacuna', language: EN }),
          makeWordInsert({ word: 'lacrimal', language: EN }),
          makeWordInsert({ word: 'ephemeral', language: EN }),
          makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }),
        ])

        // empty query lists every row.
        expect(yield* selectWords({})).toHaveLength(4)
        // language filter.
        expect(yield* selectWords({ language: EN })).toHaveLength(3)
        // word as an array.
        expect(yield* selectWords({ word: ['lacuna', 'ephemeral'] })).toHaveLength(3)
        // case-insensitive prefix search on `word`.
        expect(
          (yield* selectWords({ language: EN, search: 'LAC' })).map((r) => r.word).sort(),
        ).toEqual(['lacrimal', 'lacuna'])
        // limit caps the result.
        expect(yield* selectWords({ language: EN, limit: 1 })).toHaveLength(1)
        // by id.
        const [one] = yield* selectWords({ word: 'ephemeral' })
        expect((yield* selectWords({ id: one?.id ?? '' }))[0]?.word).toBe('ephemeral')
      }),
    )
  })

  describe('selectWord', () => {
    it.effect('absent word → Option.none (a value, not a failure)', () =>
      Effect.gen(function* () {
        yield* resetDb
        expect(Option.isNone(yield* selectWord(EN, 'lacuna'))).toBe(true)
      }),
    )

    it.effect('existing word → Some(the saved row)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const saved = yield* upsertWords(makeWordInsert({ word: 'lacuna', language: EN }))

        // selectWord lifts selectWords into Option; it owns only that a hit is Some(the same row).
        // Row content fidelity is owned by the selectWords/upsertWords tests above — assert identity.
        const row = Option.getOrThrow(yield* selectWord(EN, 'lacuna'))
        expect(row.id).toBe(saved.id)
      }),
    )
  })

  describe('upsertWords', () => {
    it.effect('is the upsert promotion: regen replaces in place on UNIQUE(word, language)', () =>
      Effect.gen(function* () {
        yield* resetDb

        const first = yield* upsertWords(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'first generation' }),
        )
        const second = yield* upsertWords(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'second generation' }),
        )
        expect(second.id).toBe(first.id)
        expect(second.coreDefinition).toBe('second generation')

        // Same word, other language ⇒ a distinct row.
        const ru = yield* upsertWords(makeWordInsert({ word: 'lacuna', language: enumLanguage.ru }))
        expect(ru.id).not.toBe(first.id)
        expect(yield* selectWords({ word: 'lacuna' })).toHaveLength(2)
      }),
    )

    it.effect('(array) inserts many atomically and returns a row per item', () =>
      Effect.gen(function* () {
        yield* resetDb

        const rows = yield* upsertWords([
          makeWordInsert({ word: 'lacuna', language: EN }),
          makeWordInsert({ word: 'ephemeral', language: EN }),
        ])
        expect(rows).toHaveLength(2)
        expect(new Set(rows.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
        expect(yield* selectWords({ language: EN })).toHaveLength(2)
      }),
    )

    it.effect('(array) is per-row, not atomic: a failing row fails, earlier rows persist', () =>
      Effect.gen(function* () {
        yield* resetDb

        // (word, language) duplicates would just upsert, so force a real failure: a NOT NULL violation
        // on the second row. Each content is its own statement (no transaction), so the valid first
        // row is already saved when the second fails.
        const broken = makeWordInsert({ word: 'ephemeral', language: EN })
        // @ts-expect-error null violates the NOT NULL `core_definition` column — forces a mid-batch failure.
        broken.coreDefinition = null

        const exit = yield* Effect.exit(
          upsertWords([makeWordInsert({ word: 'lacuna', language: EN }), broken]),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        // The valid first insert committed before the second row failed — not rolled back.
        const persisted = yield* selectWords({})
        expect(persisted.map((r) => r.word)).toEqual(['lacuna'])
      }),
    )

    it.effect('(array) handles rows that carry different optional columns', () =>
      Effect.gen(function* () {
        yield* resetDb

        // Heterogeneous batch: one content carries `frequency`, the other omits the key entirely. A
        // single shared conflict SET could not serve both; per-row derives each SET from its own keys.
        const withFreq = makeWordInsert({ word: 'lacuna', language: EN })
        const withoutFreq = makeWordInsert({ word: 'ephemeral', language: EN })
        delete withoutFreq.frequency

        const rows = yield* upsertWords([withFreq, withoutFreq])
        expect(new Set(rows.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
        expect(yield* selectWords({ language: EN })).toHaveLength(2)
      }),
    )
  })
})
