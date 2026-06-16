import { expect, it } from '@effect/vitest'
import { WordBuilder, WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import type { EffectDrizzleQueryError } from '@lexiai/database'
import { enumLanguage } from '@lexiai/database'
import { Effect, Layer, Ref, Schema } from 'effect'
import { processBatch } from '../src/process-batch'

const EN = enumLanguage.en
const encode = Schema.encodeSync(WordBuildMessageFromJson)

// processBatch only ever *catches* a build failure (it records the record's id and never inspects the
// error value), so a stand-in is enough to drive the failure path without constructing the real
// drizzle error or importing drizzle into the worker layer.
const dbError = new Error('db boom') as unknown as EffectDrizzleQueryError

it.effect(
  'reports failed builds, skips foreign bodies, and isolates one failure from the rest',
  () =>
    Effect.gen(function* () {
      const built = yield* Ref.make<ReadonlyArray<string>>([])
      // 'boom' fails with a DB error (the redrive case); every other word succeeds and is recorded.
      const MockWordBuilder = Layer.succeed(
        WordBuilder,
        WordBuilder.of({
          build: (_language, word) =>
            word === 'boom' ? Effect.fail(dbError) : Ref.update(built, (xs) => [...xs, word]),
        }),
      )

      const records = [
        { id: 'ok-1', body: encode({ language: EN, word: 'lacuna' }) },
        { id: 'fail-1', body: encode({ language: EN, word: 'boom' }) },
        { id: 'foreign-1', body: JSON.stringify({ kind: 'something-else' }) },
        { id: 'ok-2', body: encode({ language: EN, word: 'serein' }) },
      ]

      const failedIds = yield* processBatch(records).pipe(Effect.provide(MockWordBuilder))

      // Only the DB-failing record is returned: a success is absent (the edge acks it), and a foreign
      // body is skipped — neither built nor failed (AC-5).
      expect(failedIds).toEqual(['fail-1'])
      // The failure did not abort the others — both valid words still built (AC-4, isolation).
      expect(yield* Ref.get(built)).toEqual(expect.arrayContaining(['lacuna', 'serein']))
    }),
)
