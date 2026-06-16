import { expect, it } from '@effect/vitest'
import { WordBuilder, WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import type { EffectDrizzleQueryError } from '@lexiai/database'
import { enumLanguage } from '@lexiai/database'
import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { Effect, Layer, Schema } from 'effect'
import { sqsBatchHandler } from '../src/handler'

const EN = enumLanguage.en
const encode = Schema.encodeSync(WordBuildMessageFromJson)

// The handler only catches build failures (never inspects the error value), so a stand-in suffices.
const dbError = new Error('db boom') as unknown as EffectDrizzleQueryError

// 'boom' fails with a DB error (the redrive case); every other word succeeds.
const MockWordBuilder = Layer.succeed(
  WordBuilder,
  WordBuilder.of({
    build: (_language, word) => (word === 'boom' ? Effect.fail(dbError) : Effect.void),
  }),
)

// The handler reads only `messageId` + `body`; the rest of the SQS envelope is irrelevant here.
const record = (messageId: string, body: string): SQSRecord =>
  ({ messageId, body }) as unknown as SQSRecord
const event = (records: ReadonlyArray<SQSRecord>): SQSEvent => ({ Records: [...records] })

it.effect('all records succeed → empty batchItemFailures (AWS deletes the whole batch)', () =>
  Effect.gen(function* () {
    const response = yield* sqsBatchHandler(
      event([record('m1', encode({ language: EN, word: 'lacuna' }))]),
    )
    expect(response.batchItemFailures).toEqual([])
  }).pipe(Effect.provide(MockWordBuilder)),
)

it.effect('partial failure → batchItemFailures carries only the failed record’s messageId', () =>
  Effect.gen(function* () {
    const response = yield* sqsBatchHandler(
      event([
        record('ok', encode({ language: EN, word: 'lacuna' })),
        record('bad', encode({ language: EN, word: 'boom' })),
      ]),
    )
    // The handler's own job is the SQS envelope: map processBatch's failedIds to batchItemFailures
    // keyed on messageId (only failures replay). Failure isolation across a batch and foreign-body
    // skipping are processBatch's logic — owned by process-batch.test.ts, not re-driven here.
    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'bad' }])
  }).pipe(Effect.provide(MockWordBuilder)),
)
