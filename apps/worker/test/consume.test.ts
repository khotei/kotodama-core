import { expect, it } from '@effect/vitest'
import {
  WordBuilderLive,
  WordBuildMessageFromJson,
  WordBuildRequester,
  WordBuildRequesterLive,
  WordBuildStateLive,
} from '@lexiai/core-async-word-jobs'
import { MockContentEngine } from '@lexiai/core-content'
import { WordFinderLive } from '@lexiai/core-words'
import { enumAsyncJobStatus, enumLanguage } from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { QueueService } from '@lexiai/queue'
import { drainQueue, QueueLocalStackLive } from '@lexiai/queue/testing'
import { AsyncWordJobsRepo, AsyncWordJobsRepoLive } from '@lexiai/repositories-async-word-jobs'
import { WordsRepo, WordsRepoLive } from '@lexiai/repositories-words'
import { Effect, Layer, Schema } from 'effect'
import { ConsumePoll, consumeOnce } from '../src/consume'

const EN = enumLanguage.en

// One LocalStack SQS + one test DB (two containers), shared across the file (it.layer builds the
// layer once), so a WordBuildRequester *enqueue* is consumable by the worker loop in the same test —
// the real request → queue → worker → build path, not a stubbed message. `ConsumePoll` is shrunk to a
// 1s wait so an empty-queue `consumeOnce` returns promptly instead of blocking the full 20s default.
const InfraLive = Layer.mergeAll(
  WordsRepoLive,
  AsyncWordJobsRepoLive,
  MockContentEngine,
  QueueLocalStackLive,
).pipe(Layer.provideMerge(TestDatabaseLive))

const StateLive = WordBuildStateLive.pipe(
  Layer.provideMerge(WordFinderLive),
  Layer.provideMerge(InfraLive),
)
const TestLayer = Layer.mergeAll(WordBuildRequesterLive, WordBuilderLive).pipe(
  Layer.provideMerge(StateLive),
  Layer.provideMerge(Layer.succeed(ConsumePoll, { max: 10, waitSeconds: 1 })),
)

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect(
    'enqueue → worker consumes → Not-yet-made word reaches Ready (AC-3, AC-4, AC-5 e2e)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue
        const requester = yield* WordBuildRequester
        const jobs = yield* AsyncWordJobsRepo
        const words = yield* WordsRepo

        // AC-3 — an explicit create request on a Not-yet-made word starts exactly one build and moves the
        // word to Being made: stages seeded, a message enqueued, and no `words` row yet.
        const state = yield* requester.request(EN, 'lacuna')
        expect(state.status).toBe('running')
        expect(yield* words.find({ language: EN, word: 'lacuna' })).toHaveLength(0)
        expect((yield* jobs.findStages({ language: EN, word: 'lacuna' })).length).toBeGreaterThan(0)

        // The worker consumes the one message and drives the build to completion.
        expect(yield* consumeOnce).toBe(1)

        // AC-4 — every ordered pass advanced to succeeded (observable progress through the pipeline).
        const stages = yield* jobs.findStages({ language: EN, word: 'lacuna' })
        expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)

        // AC-5 — the word is now Ready: a subsequent lookup returns it with assembled content.
        const [ready] = yield* words.find({ language: EN, word: 'lacuna', limit: 1 })
        expect(ready?.visuals.hero).not.toBeNull()

        // The message was acked (deleted only after success) — the queue is now empty.
        expect(yield* consumeOnce).toBe(0)
      }),
  )

  it.effect('re-delivery of the same build message yields exactly one words row (idempotent)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const requester = yield* WordBuildRequester
      const queue = yield* QueueService
      const words = yield* WordsRepo

      yield* requester.request(EN, 'lacuna')
      expect(yield* consumeOnce).toBe(1) // first delivery → Ready, acked

      // Model an SQS redrive: the identical message arrives again. WordBuildRequester would converge and not
      // re-enqueue, so re-send the encoded body directly to stand in for the transport redelivering it.
      const body = Schema.encodeSync(WordBuildMessageFromJson)({ language: EN, word: 'lacuna' })
      yield* queue.send(body)
      expect(yield* consumeOnce).toBe(1) // re-delivery re-runs the build

      // The promotion upsert on UNIQUE(word, language) means the re-run produced no second row.
      const allWords = yield* words.find({})
      expect(allWords).toHaveLength(1)
      expect(allWords[0]?.word).toBe('lacuna')
    }),
  )

  it.effect('a body that is not a WordBuildMessage is skipped — no build, no crash', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const queue = yield* QueueService
      const words = yield* WordsRepo

      // A foreign body on the queue (valid JSON, wrong shape) must not run a build.
      yield* queue.send(JSON.stringify({ kind: 'something-else' }))
      yield* consumeOnce

      expect(yield* words.find({})).toHaveLength(0)
    }),
  )
})
