import { expect, it } from '@effect/vitest'
import { AiServiceTest } from '@kotodama/ai/testing'
import { WordBuildMessageFromJson } from '@kotodama/core-async-word-jobs'
import { MockContentEngine, WordGenerationServiceLive } from '@kotodama/core-content'
import { WordVerdict } from '@kotodama/core-words'
import { enumAsyncJobStatus, enumLanguage } from '@kotodama/database'
import { resetDb, TestDatabaseLive } from '@kotodama/database/testing'
import { JobsQueue } from '@kotodama/queue'
import { drainQueue, QueueLocalStackLive } from '@kotodama/queue/testing'
import { selectWordJobStages } from '@kotodama/repositories-async-word-jobs'
import { selectWords } from '@kotodama/repositories-words'
import { requestWordBuild } from '@kotodama/use-cases'
import { Effect, Layer, Schema } from 'effect'
import { ConsumePoll, consumeOnce } from '../src/consume'

const EN = enumLanguage.en

// One LocalStack SQS + one test DB (two containers), shared across the file (it.layer builds the
// layer once), so a `requestWordBuild` *enqueue* is consumable by the worker loop in the same test —
// the real request → queue → worker → build path, not a stubbed message. The flows are plain functions
// bottoming out at WordGenerationService (the mock engine wrapped in WordGenerationServiceLive) +
// JobsQueue + DB + the verifier's AiService (`requestWordBuild`'s judge, faked to always admit so the
// e2e path builds without a network call), which this layer provides. `ConsumePoll` is shrunk to a 1s
// wait so an empty-queue `consumeOnce` returns promptly instead of blocking 20s.
const AiServiceAdmit = AiServiceTest({
  object: WordVerdict.make({ isValid: true, reason: 'admit' }),
})
const TestLayer = Layer.mergeAll(
  WordGenerationServiceLive.pipe(Layer.provide(MockContentEngine)),
  QueueLocalStackLive,
  AiServiceAdmit,
).pipe(
  Layer.provideMerge(TestDatabaseLive),
  Layer.provideMerge(Layer.succeed(ConsumePoll, { max: 10, waitSeconds: 1 })),
)

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect(
    'enqueue → worker consumes → Not-yet-made word reaches Ready (AC-3, AC-4, AC-5 e2e)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue

        // AC-3 — an explicit create request on a Not-yet-made word starts exactly one build and moves the
        // word to Being made: a `pending` `words` row seeded (F-CONT-006 — the row IS the list entry, so
        // it lands at once, content NULL), the 6 stages seeded, and a message enqueued.
        const seeded = yield* requestWordBuild(EN, 'lacuna')
        expect(seeded.length).toBeGreaterThan(0)
        const [requested] = yield* selectWords({ language: EN, word: 'lacuna', limit: 1 })
        expect(requested?.status).toBe(enumAsyncJobStatus.pending)
        expect(
          (yield* selectWordJobStages({ language: EN, word: 'lacuna' })).length,
        ).toBeGreaterThan(0)

        // The worker consumes the one message and drives the build to completion.
        expect(yield* consumeOnce).toBe(1)

        // AC-4 — every ordered pass advanced to succeeded (observable progress through the pipeline).
        const stages = yield* selectWordJobStages({ language: EN, word: 'lacuna' })
        expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)

        // AC-5 — the word is now Ready: a subsequent lookup returns it with assembled content.
        // Content columns are nullable in storage (lifecycle table); a `succeeded` row has them all.
        const [ready] = yield* selectWords({ language: EN, word: 'lacuna', limit: 1 })
        expect(ready?.visuals?.hero).not.toBeNull()

        // The message was acked (deleted only after success) — the queue is now empty.
        expect(yield* consumeOnce).toBe(0)
      }),
  )

  it.effect('re-delivery of the same build message yields exactly one words row (idempotent)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const queue = yield* JobsQueue

      yield* requestWordBuild(EN, 'lacuna')
      expect(yield* consumeOnce).toBe(1) // first delivery → Ready, acked

      // Model an SQS redrive: the identical message arrives again. `requestWordBuild` would converge and
      // not re-enqueue, so re-send the encoded body directly to stand in for the transport redelivering it.
      const body = Schema.encodeSync(WordBuildMessageFromJson)({ language: EN, word: 'lacuna' })
      yield* queue.send(body)
      expect(yield* consumeOnce).toBe(1) // re-delivery re-runs the build

      // The promotion upsert on UNIQUE(word, language) means the re-run produced no second row.
      const allWords = yield* selectWords({})
      expect(allWords).toHaveLength(1)
      expect(allWords[0]?.word).toBe('lacuna')
    }),
  )

  it.effect('a body that is not a WordBuildMessage is skipped — no build, no crash', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const queue = yield* JobsQueue

      // A foreign body on the queue (valid JSON, wrong shape) must not run a build.
      yield* queue.send(JSON.stringify({ kind: 'something-else' }))
      yield* consumeOnce

      expect(yield* selectWords({})).toHaveLength(0)
    }),
  )
})
