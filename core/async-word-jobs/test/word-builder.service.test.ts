import { expect, it } from '@effect/vitest'
import {
  type ContentPolicy,
  defaultContentPolicy,
  makeMockContentEngine,
} from '@lexiai/core-content'
import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  wordJobStage,
} from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import { AsyncWordJobsRepo, AsyncWordJobsRepoLive } from '@lexiai/repositories-async-word-jobs'
import { seedPendingPipeline } from '@lexiai/repositories-async-word-jobs/testing'
import { WordsRepo, WordsRepoLive } from '@lexiai/repositories-words'
import { Duration, Effect, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { WordBuilder, WordBuilderLive, WordBuilderStageTimeout } from '../src/index'

const EN = enumLanguage.en
const PIPELINE_LENGTH = wordJobStage.enumValues.length

// A tiny per-pass budget so the timeout test resolves in milliseconds; every other word's mock passes
// are instant, so they never trip it.
const TEST_STAGE_TIMEOUT = Duration.millis(200)
const SLOW_WORD = 'slowpoke'

// The default policy plus a *faster* slow path than the 30s demo word, so the timeout test stays quick:
// `slowpoke` delays its visuals pass past TEST_STAGE_TIMEOUT but well under the file's 120s ceiling.
const testPolicy: ContentPolicy = (word, stage) =>
  word === SLOW_WORD && stage === enumWordJobStage.enrich_visuals
    ? { kind: 'produce', delayMillis: 1000 }
    : defaultContentPolicy(word, stage)

// WordBuilder depends only on the ContentEngine swap boundary (here the mock) + the two repos ← DB.
const TestLayer = WordBuilderLive.pipe(
  Layer.provide(Layer.succeed(WordBuilderStageTimeout, TEST_STAGE_TIMEOUT)),
  Layer.provideMerge(
    Layer.mergeAll(WordsRepoLive, AsyncWordJobsRepoLive, makeMockContentEngine(testPolicy)),
  ),
  Layer.provideMerge(TestDatabaseLive),
)

const byStage = (rows: ReadonlyArray<Pick<AsyncWordJobRow, 'stage' | 'status'>>) =>
  new Map(rows.map((row) => [row.stage, row.status] as const))

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  it.effect('a full run advances every pass, then promotes exactly one words row (AC-5)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const builder = yield* WordBuilder
      const jobs = yield* AsyncWordJobsRepo
      const words = yield* WordsRepo
      yield* seedPendingPipeline(EN, 'lacuna')

      yield* builder.build(EN, 'lacuna')

      // Every pass succeeded...
      const stages = yield* jobs.findStages({ language: EN, word: 'lacuna' })
      expect(stages).toHaveLength(PIPELINE_LENGTH)
      expect(stages.every((stage) => stage.status === enumAsyncJobStatus.succeeded)).toBe(true)

      // ...and promotion produced exactly one ready word with assembled content.
      const [word] = yield* words.find({ language: EN, word: 'lacuna', limit: 1 })
      expect(word?.coreDefinition.length).toBeGreaterThan(0)
      expect(word?.visuals.hero).not.toBeNull()
    }),
  )

  it.effect('a pass failure stops the build in declaration order — no words row (AC-4, AC-5)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const builder = yield* WordBuilder
      const jobs = yield* AsyncWordJobsRepo
      const words = yield* WordsRepo
      // `kaboom` is the reserved demo word that fails at enrich_visuals (the 5th of 6 passes).
      yield* seedPendingPipeline(EN, 'kaboom')

      yield* builder.build(EN, 'kaboom')

      const status = byStage(yield* jobs.findStages({ language: EN, word: 'kaboom' }))
      // Passes before the failure succeeded, in declaration order; the failing pass is `failed`;
      // passes after it never ran (still `pending`) — observable progress, AC-4.
      expect(status.get(enumWordJobStage.fetch_source)).toBe(enumAsyncJobStatus.succeeded)
      expect(status.get(enumWordJobStage.enrich_etymology)).toBe(enumAsyncJobStatus.succeeded)
      expect(status.get(enumWordJobStage.enrich_tiers)).toBe(enumAsyncJobStatus.succeeded)
      expect(status.get(enumWordJobStage.enrich_authors)).toBe(enumAsyncJobStatus.succeeded)
      expect(status.get(enumWordJobStage.enrich_visuals)).toBe(enumAsyncJobStatus.failed)
      expect(status.get(enumWordJobStage.final_review)).toBe(enumAsyncJobStatus.pending)

      // The pristine invariant: a partial build never creates a words row (AC-5 negative).
      expect(yield* words.find({ language: EN, word: 'kaboom' })).toHaveLength(0)
    }),
  )

  it.effect('the failed pass records the typed JobError (failed)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const builder = yield* WordBuilder
      const jobs = yield* AsyncWordJobsRepo
      yield* seedPendingPipeline(EN, 'kaboom')

      yield* builder.build(EN, 'kaboom')

      const [failed] = yield* jobs.findStages({
        language: EN,
        word: 'kaboom',
        stage: enumWordJobStage.enrich_visuals,
      })
      expect(failed?.error?.type).toBe(enumJobErrorType.failed)
    }),
  )

  it.effect(
    'a pass exceeding its bounded lifetime fails with timed_out — no words row (AC-13)',
    () =>
      Effect.gen(function* () {
        yield* resetDb
        const builder = yield* WordBuilder
        const jobs = yield* AsyncWordJobsRepo
        const words = yield* WordsRepo
        yield* seedPendingPipeline(EN, SLOW_WORD)

        // The mock delay and the timeout are both clock-driven; `it.effect` runs on the TestClock, so run
        // this pass on the live clock to let the 200ms budget actually elapse and interrupt the pass.
        yield* TestClock.withLive(builder.build(EN, SLOW_WORD))

        const status = byStage(yield* jobs.findStages({ language: EN, word: SLOW_WORD }))
        // The slow pass is interrupted at the budget and recorded `failed`; the run stops there.
        expect(status.get(enumWordJobStage.enrich_authors)).toBe(enumAsyncJobStatus.succeeded)
        expect(status.get(enumWordJobStage.enrich_visuals)).toBe(enumAsyncJobStatus.failed)
        expect(status.get(enumWordJobStage.final_review)).toBe(enumAsyncJobStatus.pending)

        const [timedOut] = yield* jobs.findStages({
          language: EN,
          word: SLOW_WORD,
          stage: enumWordJobStage.enrich_visuals,
        })
        expect(timedOut?.error?.type).toBe(enumJobErrorType.timed_out)

        expect(yield* words.find({ language: EN, word: SLOW_WORD })).toHaveLength(0)
      }),
  )

  it.effect('a not_found pass records the typed not_found error — no words row (AC-12)', () =>
    Effect.gen(function* () {
      yield* resetDb
      const builder = yield* WordBuilder
      const jobs = yield* AsyncWordJobsRepo
      const words = yield* WordsRepo
      // `xyzzy` is the reserved demo word that fails at fetch_source (the first pass) with not_found.
      yield* seedPendingPipeline(EN, 'xyzzy')

      yield* builder.build(EN, 'xyzzy')

      const [failed] = yield* jobs.findStages({
        language: EN,
        word: 'xyzzy',
        stage: enumWordJobStage.fetch_source,
      })
      expect(failed?.status).toBe(enumAsyncJobStatus.failed)
      expect(failed?.error?.type).toBe(enumJobErrorType.not_found)

      // The first pass failed, so nothing downstream ran and no word was promoted.
      expect(yield* words.find({ language: EN, word: 'xyzzy' })).toHaveLength(0)
    }),
  )
})
