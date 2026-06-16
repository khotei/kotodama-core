import { expect, it } from '@effect/vitest'
import {
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  wordJobStage,
} from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { drainQueue, QueueLocalStackLive } from '@lexiai/queue/testing'
import { AsyncWordJobsRepo, AsyncWordJobsRepoLive } from '@lexiai/repositories-async-word-jobs'
import { seedFailedWord } from '@lexiai/repositories-async-word-jobs/testing'
import { WordsRepoLive } from '@lexiai/repositories-words'
import { seedReadyWord } from '@lexiai/repositories-words/testing'
import { Effect, Layer, Schema } from 'effect'
import {
  WordBuildMessageFromJson,
  WordBuildRequester,
  WordBuildRequesterLive,
  WordBuildStateLive,
} from '../src/index'

// WordBuildRequester ← WordBuildState ← repos; ← QueueService (real SQS via a per-file LocalStack
// container) ← DB. Two containers per file (Postgres + LocalStack); `provideMerge` keeps every
// service in context so a test can seed ground truths via the repos and inspect the queue.
const TestLayer = WordBuildRequesterLive.pipe(
  Layer.provideMerge(WordBuildStateLive),
  Layer.provideMerge(Layer.mergeAll(WordsRepoLive, AsyncWordJobsRepoLive, QueueLocalStackLive)),
  Layer.provideMerge(TestDatabaseLive),
)

const EN = enumLanguage.en
const WORD = 'lacuna'
const PIPELINE_LENGTH = wordJobStage.enumValues.length

// The LocalStack queue persists across this file's tests (one container per file); `drainQueue`
// receive-and-deletes everything, so call it at the top of each test (the SQS analogue of `resetDb`)
// and use its return value as the "what got enqueued?" assertion source.
it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('Not-yet-made → running: seeds every stage + enqueues exactly one build (AC-3)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const request = yield* WordBuildRequester
      const jobs = yield* AsyncWordJobsRepo

      const state = yield* request.request(EN, WORD)
      expect(state.status).toBe('running')

      // Exactly one build dispatched, carrying the (language, word) identity.
      const messages = yield* drainQueue
      expect(messages).toHaveLength(1)
      const [message] = messages
      expect(Schema.decodeUnknownSync(WordBuildMessageFromJson)(message?.body ?? '')).toEqual({
        language: EN,
        word: WORD,
      })

      // The whole pipeline is seeded `pending`.
      const stages = yield* jobs.findStages({ language: EN, word: WORD })
      expect(stages).toHaveLength(PIPELINE_LENGTH)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.pending)).toBe(true)
    }),
  )

  it.effect(
    'Being-made → WordBuildInProgressError: no new build, no second enqueue, no duplicate rows (AC-7, AC-8)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue
        const request = yield* WordBuildRequester
        const jobs = yield* AsyncWordJobsRepo

        expect((yield* request.request(EN, WORD)).status).toBe('running')
        const afterFirst = yield* jobs.findStages({ language: EN, word: WORD })

        // The load-bearing dedup invariant: a second create while Being-made fails, starting nothing new.
        const error = yield* request.request(EN, WORD).pipe(Effect.flip)
        expect(error._tag).toBe('WordBuildInProgressError')

        // One message total — the second request enqueued nothing — and no duplicate rows.
        expect(yield* drainQueue).toHaveLength(1)
        const afterSecond = yield* jobs.findStages({ language: EN, word: WORD })
        expect(afterSecond).toHaveLength(PIPELINE_LENGTH)
        expect(afterSecond).toHaveLength(afterFirst.length)
      }),
  )

  it.effect('Ready → WordAlreadyReadyError: nothing enqueued, no build seeded (AC-6)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const request = yield* WordBuildRequester
      const jobs = yield* AsyncWordJobsRepo
      yield* seedReadyWord(EN, WORD)

      const error = yield* request.request(EN, WORD).pipe(Effect.flip)
      expect(error._tag).toBe('WordAlreadyReadyError')
      expect(yield* drainQueue).toHaveLength(0)
      expect(yield* jobs.findStages({ language: EN, word: WORD })).toHaveLength(0)
    }),
  )

  it.effect('Couldn’t-be-made → running: a retry request reseeds a clean build + re-enqueues', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const request = yield* WordBuildRequester
      const jobs = yield* AsyncWordJobsRepo
      // Drive the word terminal-failed (the Couldn't-be-made state).
      yield* seedFailedWord(EN, WORD, enumWordJobStage.fetch_source, {
        message: 'no source found',
        type: enumJobErrorType.not_found,
      })

      expect((yield* request.request(EN, WORD)).status).toBe('running')
      // A clean new build: stages reset to pending, one fresh dispatch.
      const stages = yield* jobs.findStages({ language: EN, word: WORD })
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.pending)).toBe(true)
      expect(yield* drainQueue).toHaveLength(1)
    }),
  )

  it.effect(
    'concurrent requests for the same new word race to one build — no duplicate rows (AC-8)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue
        const request = yield* WordBuildRequester
        const jobs = yield* AsyncWordJobsRepo

        // Recover each to a tag sentinel — the losers fail WordBuildInProgressError, which would
        // otherwise short-circuit Effect.all.
        const tags = yield* Effect.all(
          Array.from({ length: 5 }, () =>
            request
              .request(EN, WORD)
              .pipe(
                Effect.match({ onFailure: () => 'rejected' as const, onSuccess: (s) => s.status }),
              ),
          ),
          { concurrency: 'unbounded' },
        )

        // At least one request started the build; the UNIQUE(word, language, stage) constraint +
        // idempotent upsert guarantee a single set of stage rows under the race.
        expect(tags).toContain('running')
        expect(yield* jobs.findStages({ language: EN, word: WORD })).toHaveLength(PIPELINE_LENGTH)
      }),
  )

  it.effect(
    'symbol-only input → InvalidWordInputError: nothing seeded, nothing enqueued (AC-11)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* drainQueue
        const request = yield* WordBuildRequester
        const jobs = yield* AsyncWordJobsRepo

        const error = yield* request.request(EN, '!!!').pipe(Effect.flip)
        expect(error._tag).toBe('InvalidWordInputError')
        expect(yield* drainQueue).toHaveLength(0)
        expect(yield* jobs.findStages({ language: EN, word: '!!!' })).toHaveLength(0)
      }),
  )

  it.effect('a phrase builds its first word only (AC-10)', () =>
    Effect.gen(function* () {
      yield* resetDb
      yield* drainQueue
      const request = yield* WordBuildRequester
      const jobs = yield* AsyncWordJobsRepo

      expect((yield* request.request(EN, `${WORD} ipsum`)).status).toBe('running')

      // The build targets the first word; the raw phrase seeds nothing.
      expect(yield* jobs.findStages({ language: EN, word: WORD })).toHaveLength(PIPELINE_LENGTH)
      expect(yield* jobs.findStages({ language: EN, word: `${WORD} ipsum` })).toHaveLength(0)
      const [message] = yield* drainQueue
      expect(Schema.decodeUnknownSync(WordBuildMessageFromJson)(message?.body ?? '')).toEqual({
        language: EN,
        word: WORD,
      })
    }),
  )
})
