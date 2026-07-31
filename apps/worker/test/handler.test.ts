import { expect, it } from '@effect/vitest'
import {
  MockContentEngine,
  WordGenerationService,
  WordGenerationServiceLive,
} from '@kotodama/core/content'
import { seedUnreadyWord } from '@kotodama/core/repositories/testing'
import { WordBuildMessageFromJson } from '@kotodama/core/words'
import { enumLanguage } from '@kotodama/database'
import { resetDb, TestDatabaseLive } from '@kotodama/database/testing'
import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { Effect, Layer, Schema } from 'effect'
import { sqsBatchHandler } from '../src/handler'

const EN = enumLanguage.en
const encode = Schema.encodeSync(WordBuildMessageFromJson)

// The handler reads only `messageId` + `body`; the rest of the SQS envelope is irrelevant here.
const record = (messageId: string, body: string): SQSRecord =>
  ({ messageId, body }) as unknown as SQSRecord
const event = (records: ReadonlyArray<SQSRecord>): SQSEvent => ({ Records: [...records] })

// The word whose generation *dies* (an unrecoverable defect, the way `createWord`'s `orDie` on a
// malformed assembly would) — so the handler's non-success envelope mapping is exercised without a
// malformed-content fixture. Same defect decorator as process-batch.test.ts, transparent for every
// non-BOOM word.
const BOOM = 'boom'
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

// The handler owns only the SQS envelope: map processBatch's failedIds → batchItemFailures keyed on the
// inbound messageId. Item-failure isolation itself (`matchCause`, foreign-skip) is owned by
// process-batch.test.ts; here we assert just the translation, on both a fully-built batch (empty
// failures) and a batch with one dying build (its messageId returns as the sole `itemIdentifier`).
// `buildWord` runs for real over the mock engine + a test DB (a plain function, no service to stub).
const TestLayer = Layer.mergeAll(DefectGenerationLive, TestDatabaseLive)

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('all records build → empty batchItemFailures (AWS deletes the whole batch)', () =>
    Effect.gen(function* () {
      yield* resetDb
      // Seed each word's `pending` `words` row, as `requestWordBuild` does before enqueueing
      // (F-CONT-006 — `buildWord` flips/promotes an existing row, never seeds); driving the handler
      // directly skips the request tier, so the seed must be reproduced.
      yield* seedUnreadyWord(EN, 'lacuna')
      yield* seedUnreadyWord(EN, 'serein')
      const response = yield* sqsBatchHandler(
        event([
          record('m1', encode({ language: EN, word: 'lacuna' })),
          record('m2', encode({ language: EN, word: 'serein' })),
        ]),
      )
      expect(response.batchItemFailures).toEqual([])
    }),
  )

  it.effect(
    'a dying build → its messageId is the sole itemIdentifier, m1 still deletes (AC-13)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        // Seed only the buildable word; BOOM is left unseeded — its generation dies before any promote,
        // exactly as in process-batch.test.ts.
        yield* seedUnreadyWord(EN, 'lacuna')
        const response = yield* sqsBatchHandler(
          event([
            record('m1', encode({ language: EN, word: 'lacuna' })),
            record('m2', encode({ language: EN, word: BOOM })),
          ]),
        )
        // The envelope keys the failed item on the inbound messageId: m1 built (AWS deletes it), only
        // m2 redrives — proving the failedId → itemIdentifier mapping, not just an empty batch.
        expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'm2' }])
      }),
  )
})
