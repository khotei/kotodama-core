import { describe, expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { DB, enumLanguage, wordsTable } from '@kotodama/database'
import { makeWordInsert } from '@kotodama/database/factories'
import { resetDb, TestDatabaseLive } from '@kotodama/database/testing'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { searchWords } from '../src/index'
import { seedReadyWord, seedUnreadyWord } from '../src/testing'

faker.seed(20260701)

const EN = enumLanguage.en

/** Seed a ready word at a fixed `createdAt` (keyset order is deterministic only when we pin it). */
const seedReadyAt = (word: string, createdAt: Date, gloss?: string) =>
  seedReadyWord(EN, word, {
    createdAt,
    // The ready-branch `gloss` reads `words.core_definition`, so pin that when a test asserts on the gloss.
    ...(gloss ? { coreDefinition: gloss } : {}),
  })

const at = (iso: string) => new Date(iso)

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  describe('searchWords — q filter', () => {
    it.effect('matches over `word` and over ready-branch `gloss` (AC-8)', () =>
      Effect.gen(function* () {
        yield* resetDb

        // `word` match: the needle is in the word, not the gloss.
        yield* seedReadyAt('lacuna', at('2026-06-01T00:00:00Z'), 'a filler title')
        // `gloss` match: the needle is in the gloss, NOT the word — must still be returned (AC-8).
        yield* seedReadyAt('ephemeral', at('2026-06-02T00:00:00Z'), 'a lacuna in the record')
        // Neither matches.
        yield* seedReadyAt('quotidian', at('2026-06-03T00:00:00Z'), 'everyday')

        const result = yield* searchWords({ language: EN, q: 'lacuna' })
        expect(new Set(result.items.map((r) => r.word))).toEqual(new Set(['lacuna', 'ephemeral']))
        expect(result.total).toBe(2)
      }),
    )

    it.effect('q is case-insensitive and honours a status filter', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyAt('Lacuna', at('2026-06-01T00:00:00Z'))
        yield* seedUnreadyWord(EN, 'lacrimal', 'pending') // a pending build's words row (NULL content)

        const succeeded = yield* searchWords({ language: EN, q: 'LAC', status: 'succeeded' })
        expect(succeeded.items.map((r) => r.word)).toEqual(['Lacuna'])

        const pending = yield* searchWords({ language: EN, q: 'LAC', status: 'pending' })
        expect(pending.items.map((r) => r.word)).toEqual(['lacrimal'])
      }),
    )
  })

  describe('searchWords — offset paging', () => {
    it.effect('walks numbered pages in recency order; total spans the whole match (AC-8)', () =>
      Effect.gen(function* () {
        yield* resetDb
        // Five ready words at descending distinct timestamps → order is w5,w4,w3,w2,w1.
        for (let n = 1; n <= 5; n++) {
          yield* seedReadyAt(`w${n}`, at(`2026-06-0${n}T00:00:00Z`))
        }

        const first = yield* searchWords({ language: EN, page: 1, limit: 2 })
        expect(first.items.map((r) => r.word)).toEqual(['w5', 'w4'])
        expect(first.total).toBe(5)

        const second = yield* searchWords({ language: EN, page: 2, limit: 2 })
        expect(second.items.map((r) => r.word)).toEqual(['w3', 'w2'])
        expect(second.total).toBe(5)

        // The last page carries the remainder; `total` is unchanged by the page/limit.
        const last = yield* searchWords({ language: EN, page: 3, limit: 2 })
        expect(last.items.map((r) => r.word)).toEqual(['w1'])
        expect(last.total).toBe(5)
      }),
    )

    it.effect('a page past the end is empty, total still reflects the full match', () =>
      Effect.gen(function* () {
        yield* resetDb
        for (let n = 1; n <= 3; n++) {
          yield* seedReadyAt(`w${n}`, at(`2026-06-0${n}T00:00:00Z`))
        }

        const beyond = yield* searchWords({ language: EN, page: 5, limit: 2 })
        expect(beyond.items).toHaveLength(0)
        expect(beyond.total).toBe(3)
      }),
    )

    it.effect('absent limit returns the whole match unpaged', () =>
      Effect.gen(function* () {
        yield* resetDb
        for (let n = 1; n <= 3; n++) {
          yield* seedReadyAt(`w${n}`, at(`2026-06-0${n}T00:00:00Z`))
        }

        const all = yield* searchWords({ language: EN })
        expect(all.items.map((r) => r.word)).toEqual(['w3', 'w2', 'w1'])
        expect(all.total).toBe(3)
      }),
    )
  })

  describe('searchWords — index-ordered scan (AC-11)', () => {
    it.effect(
      'the recency list plans as an index-ordered scan with a LIMIT early-stop (no Sort)',
      () =>
        Effect.gen(function* () {
          yield* resetDb
          const db = yield* DB
          // A few hundred rows so the planner has a real index-vs-seqscan choice — an empty table
          // always seq-scans, which would prove nothing about DESC NULLS LAST matching the index.
          const contents = Array.from({ length: 300 }, (_, n) =>
            makeWordInsert({ word: `word-${String(n).padStart(4, '0')}`, language: EN }),
          )
          yield* db.insert(wordsTable).values(contents)
          yield* db.execute(sql`ANALYZE ${wordsTable}`)

          // EXPLAIN the exact recency list shape the repo emits: language scope, ORDER BY
          // created_at DESC NULLS LAST, word, then LIMIT. What AC-11 asserts is the *sort provenance*
          // (index, not a Sort node) + LIMIT early-stop.
          const plan = yield* db.execute<{ 'QUERY PLAN': string }>(
            sql`EXPLAIN SELECT * FROM ${wordsTable}
                WHERE ${wordsTable.language} = ${EN}
                ORDER BY ${wordsTable.createdAt} DESC NULLS LAST, ${wordsTable.word} ASC
                LIMIT 20`,
          )
          const text = plan.map((r) => r['QUERY PLAN']).join('\n')

          // Index provides the order (its DDL is DESC NULLS LAST) — so no explicit Sort node…
          expect(text).toContain('Index Scan')
          expect(text).toContain('words_language_created_at_word_idx')
          expect(text).not.toContain('Sort')
          // …and LIMIT caps the scan (early-stop) rather than materializing the whole match.
          expect(text).toContain('Limit')
        }),
    )
  })
})
