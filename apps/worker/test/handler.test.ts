import { expect, it } from '@effect/vitest'
import { MockContentEngine, WordGenerationServiceLive } from '@kotodama/core/content'
import { enumLanguage } from '@kotodama/core/database'
import { resetDb, TestDatabaseLive } from '@kotodama/core/database/testing'
import { seedUnreadyWord } from '@kotodama/core/repositories/testing'
import { WordBuildMessageFromJson } from '@kotodama/core/words'
import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { Effect, Layer, Schema } from 'effect'
import { sqsBatchHandler } from '../src/handler'

const EN = enumLanguage.en
const encode = Schema.encodeSync(WordBuildMessageFromJson)

// The handler reads only `messageId` + `body`; the rest of the SQS envelope is irrelevant here.
const record = (messageId: string, body: string): SQSRecord =>
  ({ messageId, body }) as unknown as SQSRecord
const event = (records: ReadonlyArray<SQSRecord>): SQSEvent => ({ Records: [...records] })

// The handler's own job is the SQS envelope: map processBatch's failedIds → batchItemFailures keyed on
// messageId. A non-empty (redrive) envelope needs a build to fail its Effect — only a real DB fault does
// that, exercised end-to-end in consume.test.ts — so here we assert the happy envelope: a fully-built
// batch reports no failures (AWS deletes the whole batch). `buildWord` runs for real over the mock engine
// + a test DB (it is a plain function, no service to stub). The mock engine is wrapped in
// WordGenerationServiceLive — buildWord's generation seam is now the service, not ContentEngine directly.
const TestLayer = Layer.mergeAll(
  WordGenerationServiceLive.pipe(Layer.provide(MockContentEngine)),
  TestDatabaseLive,
)

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
})
