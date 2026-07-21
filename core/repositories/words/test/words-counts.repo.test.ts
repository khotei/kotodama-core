import { describe, expect, it } from '@effect/vitest'
import { faker } from '@faker-js/faker'
import { enumLanguage } from '@kotodama/core/database'
import { resetDb, TestDatabaseLive } from '@kotodama/core/database/testing'
import { Effect } from 'effect'
import { searchWords, selectWordCounts } from '../src/index'
import { seedReadyWord, seedUnreadyWord } from '../src/testing'

faker.seed(20260701)

const EN = enumLanguage.en

/** Seed a ready word at a fixed `createdAt` (mirrors `words-search.repo.test.ts` — order-deterministic). */
const seedReadyAt = (word: string, createdAt: Date) => seedReadyWord(EN, word, { createdAt })

const at = (iso: string) => new Date(iso)

it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
  describe('selectWordCounts', () => {
    it.effect('per-status counts equal a full unfiltered list walk (AC-10)', () =>
      Effect.gen(function* () {
        yield* resetDb
        // 2 succeeded, 1 pending (worker not started), 1 failed — as lifecycle `words` rows.
        yield* seedReadyAt('lacuna', at('2026-06-01T00:00:00Z'))
        yield* seedReadyAt('ephemeral', at('2026-06-02T00:00:00Z'))
        yield* seedUnreadyWord(EN, 'nascent', 'pending')
        yield* seedUnreadyWord(EN, 'phantom', 'failed')

        const counts = yield* selectWordCounts({ language: EN })

        // Ground truth: walk the whole list and tally by the same row `status` discriminant — the
        // cross-file agreement the shared `wordSearchFilter` guarantees by construction.
        const all = yield* searchWords({ language: EN, limit: 100 })
        const tally = { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0 }
        for (const row of all.items) {
          tally.total++
          tally[row.status as 'pending' | 'running' | 'succeeded' | 'failed']++
        }

        expect(counts).toEqual(tally)
        expect(counts).toEqual({ total: 4, pending: 1, running: 0, succeeded: 2, failed: 1 })
      }),
    )

    it.effect('a q filter narrows every bucket', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedReadyAt('lacuna', at('2026-06-01T00:00:00Z'))
        yield* seedReadyAt('ephemeral', at('2026-06-02T00:00:00Z'))

        const counts = yield* selectWordCounts({ language: EN, q: 'lac' })
        expect(counts).toEqual({ total: 1, pending: 0, running: 0, succeeded: 1, failed: 0 })
      }),
    )

    it.effect('a language with no words reads all-zero', () =>
      Effect.gen(function* () {
        yield* resetDb
        const counts = yield* selectWordCounts({ language: EN })
        expect(counts).toEqual({ total: 0, pending: 0, running: 0, succeeded: 0, failed: 0 })
      }),
    )
  })
})
