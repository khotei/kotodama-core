import { BunHttpServer } from '@effect/platform-bun'
import { describe, expect, it } from '@effect/vitest'
import { enumAsyncJobStatus, enumLanguage, enumWordJobStage } from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { QueueLocalStackLive } from '@lexiai/queue/testing'
import { seedPendingPipeline, seedRunningStage } from '@lexiai/repositories-async-word-jobs/testing'
import { seedReadyWord } from '@lexiai/repositories-words/testing'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { WordsApi } from '../src/words/words.api'
import { WordsApiLive } from '../src/words/words.handler'
import { assertStatus, buildWord, getWord, getWordState } from './words-api-test-utils'

// `requestWordBuild` + the reads (selectWord / selectWordJobStages + collapseWordState) are plain
// functions over the repos (which `yield*` DB) + JobsQueue — a LocalStack SQS queue + an ephemeral
// Postgres. The handler flows bottom out at JobsQueue + DB, which this layer provides, so a test can
// seed the ground-truth state each read sees.
const DomainLive = QueueLocalStackLive.pipe(Layer.provideMerge(TestDatabaseLive))

const ApiLive = HttpApiBuilder.layer(WordsApi).pipe(Layer.provide(WordsApiLive))

// Real in-memory test server (ephemeral port) + the HttpClient bound to it; the typed client
// round-trips request/response through the contract schemas, guarding the FE↔BE isomorphism.
const TestLayer = HttpRouter.serve(ApiLive, { disableListenLog: true, disableLogger: true }).pipe(
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provideMerge(DomainLive),
)

const EN = enumLanguage.en

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('GET /api/words/:language/:word', () => {
    it.effect('→ null for an unknown word', () =>
      Effect.gen(function* () {
        yield* resetDb
        expect(yield* getWord(EN, 'ghost')).toBeNull()
      }),
    )

    it.effect('→ the Word once the word is Ready', () =>
      Effect.gen(function* () {
        yield* resetDb
        const saved = yield* seedReadyWord(EN, 'lacuna')

        const word = yield* getWord(EN, 'lacuna')
        expect(word?.word).toBe('lacuna')
        expect(word?.coreDefinition).toBe(saved.coreDefinition)
      }),
    )
  })

  describe('GET /api/words/:language/:word/state', () => {
    it.effect('→ the running WordStateView round-trips over the wire', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedRunningStage(EN, 'lacuna', enumWordJobStage.fetch_source)

        const state = yield* getWordState(EN, 'lacuna')
        // The API owns only that the union discriminant + stage shape survive the contract encoding;
        // stage *ordering* and the four-state collapse are owned by core's pure collapseWordState
        // (word-state-collapse.test.ts), so assert membership, not position.
        assertStatus(state, 'running')
        expect(state.stages).toContainEqual({
          stage: enumWordJobStage.fetch_source,
          status: enumAsyncJobStatus.running,
        })
      }),
    )

    it.effect('→ null for an unknown word', () =>
      Effect.gen(function* () {
        yield* resetDb
        expect(yield* getWordState(EN, 'ghost')).toBeNull()
      }),
    )
  })

  describe('POST /api/words/:language/:word/build', () => {
    it.effect('on a Not-yet-made word → the running state (AC-3)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const state = yield* buildWord(EN, 'lacuna')
        expect(state.status).toBe('running')
      }),
    )

    // One representative typed-error round-trip is enough to prove the rejection encodes as a typed
    // 4xx (not a 500): every build error is a TaggedError through the same HttpApi error machinery, and
    // each is *compile-checked* against the endpoint's declared union (words.api.ts) — a missing
    // declaration fails tsc, never silently 500s. The per-state branching (in-progress vs already-ready
    // vs invalid input) is owned by word-build-request.use-case.test.ts, so it is not re-enumerated here.
    it.effect('on a Being-made word → a typed WordBuildInProgressError (AC-7)', () =>
      Effect.gen(function* () {
        yield* resetDb
        yield* seedPendingPipeline(EN, 'lacuna')

        const error = yield* buildWord(EN, 'lacuna').pipe(Effect.flip)
        expect(error._tag).toBe('WordBuildInProgressError')
      }),
    )
  })
})
