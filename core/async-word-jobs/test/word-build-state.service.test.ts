import { describe, expect, it } from '@effect/vitest'
import {
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  wordJobStage,
} from '@lexiai/database'
import { resetDb, TestDatabaseLive } from '@lexiai/database/testing'
import {
  AsyncWordJobsRepo,
  AsyncWordJobsRepoLive,
  stagePatch,
} from '@lexiai/repositories-async-word-jobs'
import { seedFailedWord, seedRunningStage } from '@lexiai/repositories-async-word-jobs/testing'
import { WordsRepo, WordsRepoLive } from '@lexiai/repositories-words'
import { seedReadyWord } from '@lexiai/repositories-words/testing'
import { Effect, Layer, Option } from 'effect'
import { WordBuildState, WordBuildStateLive } from '../src/index'
import { assertStatus } from '../src/testing'

const TestLayer = WordBuildStateLive.pipe(
  Layer.provideMerge(Layer.mergeAll(WordsRepoLive, AsyncWordJobsRepoLive)),
  Layer.provideMerge(TestDatabaseLive),
)

const EN = enumLanguage.en
const WORD = 'lacuna'

it.layer(TestLayer, { timeout: '120 seconds' })((it) => {
  describe('WordBuildState.get', () => {
    it.effect('absent: no word + no job → Option.none, and the read writes nothing (AC-2)', () =>
      Effect.gen(function* () {
        yield* resetDb
        const buildState = yield* WordBuildState
        const words = yield* WordsRepo
        const jobs = yield* AsyncWordJobsRepo

        expect(Option.isNone(yield* buildState.get(EN, WORD))).toBe(true)

        // The read must not have created a word or seeded any stage rows.
        expect(yield* jobs.findStages({ language: EN, word: WORD })).toHaveLength(0)
        expect(yield* words.find({ language: EN, word: WORD })).toHaveLength(0)
      }),
    )

    it.effect('succeeded: a words row → the full word row', () =>
      Effect.gen(function* () {
        yield* resetDb
        const buildState = yield* WordBuildState
        const saved = yield* seedReadyWord(EN, WORD)

        const state = Option.getOrThrow(yield* buildState.get(EN, WORD))
        assertStatus(state, 'succeeded')
        expect(state.word.word).toBe(WORD)
        expect(state.word.coreDefinition).toBe(saved.coreDefinition)
        expect(state.word.id).toBe(saved.id)
        expect(state.word.sourceVersions).toEqual(saved.sourceVersions)
      }),
    )

    it.effect(
      'running: active stages, no word → ordered stages, no error; the read is read-only',
      () =>
        Effect.gen(function* () {
          yield* resetDb
          const buildState = yield* WordBuildState
          const jobs = yield* AsyncWordJobsRepo
          yield* seedRunningStage(EN, WORD, enumWordJobStage.fetch_source)

          const state = Option.getOrThrow(yield* buildState.get(EN, WORD))
          assertStatus(state, 'running')
          expect(state.stages.map((s) => s.stage)).toEqual([...wordJobStage.enumValues])
          expect(state.stages[0]).toEqual({
            stage: enumWordJobStage.fetch_source,
            status: enumAsyncJobStatus.running,
          })

          // AC-2: re-reading leaves the stage rows untouched.
          const before = yield* jobs.findStages({ language: EN, word: WORD })
          yield* buildState.get(EN, WORD)
          expect(yield* jobs.findStages({ language: EN, word: WORD })).toEqual(before)
        }),
    )

    it.effect('stages come back in pipeline order regardless of how rows are seeded', () =>
      Effect.gen(function* () {
        yield* resetDb
        const buildState = yield* WordBuildState
        const jobs = yield* AsyncWordJobsRepo
        // Seed a subset in reverse pipeline order; the read must still sort by declaration order.
        yield* jobs.saveStages(
          EN,
          WORD,
          [
            enumWordJobStage.final_review,
            enumWordJobStage.enrich_tiers,
            enumWordJobStage.fetch_source,
          ].map(stagePatch.pending),
        )

        const state = Option.getOrThrow(yield* buildState.get(EN, WORD))
        assertStatus(state, 'running')
        expect(state.stages.map((s) => s.stage)).toEqual([
          enumWordJobStage.fetch_source,
          enumWordJobStage.enrich_tiers,
          enumWordJobStage.final_review,
        ])
      }),
    )

    it.effect(
      'failed: terminal failed stage → { status: "failed", error: { message, type } }',
      () =>
        Effect.gen(function* () {
          yield* resetDb
          const buildState = yield* WordBuildState
          yield* seedFailedWord(EN, WORD, enumWordJobStage.fetch_source, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
            cause: 'debug-only',
          })

          const state = Option.getOrThrow(yield* buildState.get(EN, WORD))
          assertStatus(state, 'failed')
          expect(state.error).toEqual({
            message: 'no source found',
            type: enumJobErrorType.not_found,
          })
          // The debug-only `cause` is dropped from the FE contract.
          expect(state.error).not.toHaveProperty('cause')
        }),
    )

    it.effect(
      'scoped per (word, language): the same spelling in another language is independent (AC-15)',
      () =>
        Effect.gen(function* () {
          yield* resetDb
          const buildState = yield* WordBuildState
          yield* seedReadyWord(EN, WORD)

          const en = Option.getOrThrow(yield* buildState.get(enumLanguage.en, WORD))
          assertStatus(en, 'succeeded')
          expect(en.word.word).toBe(WORD)
          expect(Option.isNone(yield* buildState.get(enumLanguage.ru, WORD))).toBe(true)
        }),
    )
  })
})
