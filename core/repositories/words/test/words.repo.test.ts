import { describe, expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import {
  DB,
  enumAsyncJobStatus,
  enumLanguage,
  enumVisualKind,
  wordsTable,
} from '@kotodama/database'
import { makeWordInsert } from '@kotodama/database/factories'
import { resetDb, TestDatabaseLive } from '@kotodama/database/testing'
import { eq } from 'drizzle-orm'
import { Effect, Exit, Option } from 'effect'
import { selectWord, selectWords, upsertWord, upsertWords } from '../src/index'

faker.seed(20260604)

const TestLayer = TestDatabaseLive
const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('selectWords', () => {
    it.effect('returns empty for an absent word, then the saved row after upsert', () =>
      Effect.gen(function* () {
        yield* resetDb

        expect(yield* selectWords({ language: EN, word: 'lacuna' })).toHaveLength(0)

        const saved = yield* upsertWords(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'an unfilled space' }),
        )
        expect(saved.word).toBe('lacuna')
        expect(typeof saved.id).toBe('string')
        // Typed jsonb readable straight off the row ($inferSelect keeps $type).
        expect(saved.visuals?.hero?.kind).toBe(enumVisualKind.hero)

        const [found] = yield* selectWords({ language: EN, word: 'lacuna', limit: 1 })
        expect(found?.id).toBe(saved.id)
        expect(found?.coreDefinition).toBe('an unfilled space')
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
        const row = Option.getOrThrow(yield* selectWord(EN, 'lacuna'))
        expect(row.id).toBe(saved.id)
      }),
    )
  })

  describe('upsertWords — pending seed', () => {
    it.effect('seeds a bare pending row: NULL content, status pending (AC-6)', () =>
      Effect.gen(function* () {
        yield* resetDb

        const seeded = yield* upsertWords({
          word: 'lacuna',
          language: EN,
          status: enumAsyncJobStatus.pending,
        })
        expect(seeded.word).toBe('lacuna')
        expect(seeded.status).toBe(enumAsyncJobStatus.pending)
        // A seeded row is content-less — the CHECK only demands content when `succeeded`.
        expect(seeded.coreDefinition).toBeNull()
        expect(seeded.visuals).toBeNull()
        expect(seeded.tiers).toBeNull()

        // It appears in list reads (list/counts read the words table directly, F-CONT-006).
        expect(yield* selectWords({ language: EN })).toHaveLength(1)
      }),
    )

    it.effect('re-seed of a failed row resets it to pending for retry (AC-13)', () =>
      Effect.gen(function* () {
        yield* resetDb

        const seeded = yield* upsertWords({
          word: 'lacuna',
          language: EN,
          status: enumAsyncJobStatus.pending,
        })
        // Drive the row to `failed` directly (a failed build has no content) — a raw update models the
        // failed outcome T04/T05 would record.
        const db = yield* DB
        yield* db
          .update(wordsTable)
          .set({ status: enumAsyncJobStatus.failed })
          .where(eq(wordsTable.id, seeded.id))

        // A retry re-request seeds again — same row, reset to pending (which words may be re-seeded is
        // the admission gate's decision, not the write's; the upsert is an unguarded patch).
        const reseeded = yield* upsertWords({
          word: 'lacuna',
          language: EN,
          status: enumAsyncJobStatus.pending,
        })
        expect(reseeded.id).toBe(seeded.id)
        expect(reseeded.status).toBe(enumAsyncJobStatus.pending)
      }),
    )
  })

  describe('upsertWords — promote to ready', () => {
    it.effect('patches in place: pending → succeeded + full content, id stable (AC-5)', () =>
      Effect.gen(function* () {
        yield* resetDb

        const seeded = yield* upsertWords({
          word: 'lacuna',
          language: EN,
          status: enumAsyncJobStatus.pending,
        })
        expect(seeded.status).toBe(enumAsyncJobStatus.pending)

        const promoted = yield* upsertWords(
          makeWordInsert({ word: 'lacuna', language: EN, coreDefinition: 'now ready' }),
        )
        // Same row patched in place — no INSERT/DELETE pair, the id is preserved.
        expect(promoted.id).toBe(seeded.id)
        expect(promoted.status).toBe(enumAsyncJobStatus.succeeded)
        expect(promoted.coreDefinition).toBe('now ready')
        expect(promoted.visuals?.hero?.kind).toBe(enumVisualKind.hero)

        expect(yield* selectWords({ language: EN })).toHaveLength(1)
      }),
    )

    it.effect('regen replaces content in place on UNIQUE(word, language)', () =>
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

    it.effect('a carried null clears a stale column (an omitted key keeps it)', () =>
      Effect.gen(function* () {
        yield* resetDb

        // First build carries a frequency (the factory populates it); the regen carries an explicit
        // frequency: null — under the patch upsert a carried column lands verbatim, so it clears.
        const first = yield* upsertWords(makeWordInsert({ word: 'lacuna', language: EN }))
        expect(first.frequency).not.toBeNull()
        const regen = yield* upsertWords(
          makeWordInsert({ word: 'lacuna', language: EN, frequency: null }),
        )
        expect(regen.frequency).toBeNull()
      }),
    )
  })

  describe('upsertWords — array form', () => {
    it.effect('(array) inserts many and returns a row per item', () =>
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

        // (word, language) duplicates would just upsert, so force a real failure: a `succeeded` row
        // with NULL content violates the ready CHECK. Each content is its own statement (no
        // transaction), so the valid first row is already saved when the second fails.
        const exit = yield* Effect.exit(
          upsertWords([
            makeWordInsert({ word: 'lacuna', language: EN }),
            { word: 'ephemeral', language: EN, status: enumAsyncJobStatus.succeeded },
          ]),
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

  describe('upsertWord', () => {
    it.effect('states identity via params — they win over any keys inside the patch', () =>
      Effect.gen(function* () {
        yield* resetDb

        // The patch carries a conflicting identity (a full factory insert for another word/language);
        // the wrapper's params must win.
        const row = yield* upsertWord(
          EN,
          'lacuna',
          makeWordInsert({ word: 'ephemeral', language: enumLanguage.ru }),
        )
        expect(row.word).toBe('lacuna')
        expect(row.language).toBe(EN)
        expect(yield* selectWords({})).toHaveLength(1)
      }),
    )
  })
})
