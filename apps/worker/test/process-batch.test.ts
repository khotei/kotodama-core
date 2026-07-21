import { expect, it } from '@effect/vitest'
import { WordBuildMessageFromJson } from '@kotodama/core-async-word-jobs'
import {
  MockContentEngine,
  WordGenerationService,
  WordGenerationServiceLive,
} from '@kotodama/core-content'
import { enumLanguage } from '@kotodama/database'
import { resetDb, TestDatabaseLive } from '@kotodama/database/testing'
import { selectWordJobStages } from '@kotodama/repositories-async-word-jobs'
import { selectWords } from '@kotodama/repositories-words'
import { seedUnreadyWord } from '@kotodama/repositories-words/testing'
import { Effect, Layer, Schema } from 'effect'
import { processBatch } from '../src/process-batch'

const EN = enumLanguage.en
const encode = Schema.encodeSync(WordBuildMessageFromJson)

// The sentinel word whose generation *dies* (an unrecoverable defect, not a typed failure) — the way
// `createWord`'s `orDie` on a malformed assembly would — so the batch-isolation contract can be
// exercised without a malformed-content fixture.
const BOOM = 'boom'

// A generation seam that delegates every word to the real mock-backed service, except BOOM, which it
// `die`s. A single-tag decorator over WordGenerationServiceLive (same shape as withBuildBudget).
const DefectGenerationLive = Layer.effect(
  WordGenerationService,
  Effect.gen(function* () {
    const base = yield* WordGenerationService
    return WordGenerationService.of({
      generate: (language, word) =>
        word === BOOM ? Effect.die(new Error('malformed assembly')) : base.generate(language, word),
    })
  }),
).pipe(Layer.provide(WordGenerationServiceLive.pipe(Layer.provide(MockContentEngine))))

// processBatch runs real builds over the mock engine + a test DB (buildWord is a plain function, no
// service to stub). This unit owns: a foreign body is **skipped** (neither built nor failed); valid
// messages build, so a happy batch reports no failures; and a build that **dies** is isolated to its
// own failed id (`matchCause`) rather than poisoning the batch. The DB-fault redrive path is exercised
// end-to-end in consume.test.ts. The mock engine is wrapped in the defect decorator, transparent for
// every non-BOOM word.
const TestLayer = Layer.mergeAll(DefectGenerationLive, TestDatabaseLive)

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('builds valid messages, skips foreign bodies — a happy batch has no failures', () =>
    Effect.gen(function* () {
      yield* resetDb

      // Seed each buildable word's `pending` `words` row, exactly as `requestWordBuild` does in one tx
      // before enqueueing (F-CONT-006 — `buildWord` flips/promotes an *existing* row, it never seeds).
      // Driving `processBatch` directly here skips the request tier, so the seed must be reproduced.
      yield* seedUnreadyWord(EN, 'lacuna')
      yield* seedUnreadyWord(EN, 'serein')

      const records = [
        { id: 'ok-1', body: encode({ language: EN, word: 'lacuna' }) },
        { id: 'foreign-1', body: JSON.stringify({ kind: 'something-else' }) },
        { id: 'ok-2', body: encode({ language: EN, word: 'serein' }) },
      ]

      const failedIds = yield* processBatch(records)

      // Every valid build succeeded and the foreign body was skipped — nothing to redrive (AC-5).
      expect(failedIds).toEqual([])
      // The valid words built (stage rows + a ready row); the foreign body triggered no build.
      expect((yield* selectWordJobStages({ language: EN, word: 'lacuna' })).length).toBeGreaterThan(
        0,
      )
      expect(yield* selectWords({ language: EN, word: 'lacuna' })).toHaveLength(1)
    }),
  )

  it.effect(
    'isolates a build that dies — only its id redrives, the other records still build',
    () =>
      Effect.gen(function* () {
        yield* resetDb

        // Seed the two buildable words' `pending` rows (as `requestWordBuild` would). BOOM is left
        // unseeded on purpose — its generation `die`s before any promote, so it must end with no
        // `words` row (asserted below), proving the defect was isolated to its own record.
        yield* seedUnreadyWord(EN, 'lacuna')
        yield* seedUnreadyWord(EN, 'serein')

        const records = [
          { id: 'ok-1', body: encode({ language: EN, word: 'lacuna' }) },
          { id: 'boom-1', body: encode({ language: EN, word: BOOM }) },
          { id: 'ok-2', body: encode({ language: EN, word: 'serein' }) },
        ]

        const failedIds = yield* processBatch(records)

        // The defect was caught per-record: only BOOM's id comes back to redrive, and the two valid
        // words still built to completion (a bare `Effect.match` would have let the defect tear the
        // whole batch down, so neither `serein` nor a clean `failedIds` would survive).
        expect(failedIds).toEqual(['boom-1'])
        expect(yield* selectWords({ language: EN, word: 'lacuna' })).toHaveLength(1)
        expect(yield* selectWords({ language: EN, word: 'serein' })).toHaveLength(1)
        expect(yield* selectWords({ language: EN, word: BOOM })).toHaveLength(0)
      }),
  )
})
