import { describe, expect, it } from '@effect/vitest'
import {
  enumAsyncJobStatus,
  enumLanguage,
  enumWordJobStage,
  WORD_JOB_STAGES,
  WordEntityInsert,
} from '@kotodama/core/database'
import { Duration, Effect, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { ContentEngine, ContentEngineError, MockContentEngine, makeMockContentEngine } from '../src'

const decodeWordInsert = Schema.decodeUnknownSync(WordEntityInsert)

describe('MockContentEngine — default policy', () => {
  it.effect('the six passes assemble into a valid word insert', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const slices = yield* Effect.forEach(WORD_JOB_STAGES, (stage) =>
        engine.produce(stage, enumLanguage.en, 'lacuna'),
      )
      for (const slice of slices) expect(Object.keys(slice).length).toBeGreaterThan(0)

      // Mirror the worker's promotion: assemble the per-stage results + identity + provenance +
      // `status='succeeded'` (F-CONT-006 — a promote states the ready status alongside the content, so
      // the entity decode asserts the full ready shape), and assert the whole thing validates as a
      // `words` insert (every jsonb shape covered).
      const assembled = Object.assign(
        {
          word: 'lacuna',
          language: enumLanguage.en,
          provenance: { model: 'mock', promptHash: 'mock' },
          status: enumAsyncJobStatus.succeeded,
          stages: WORD_JOB_STAGES.map((stage) => ({
            stage,
            status: enumAsyncJobStatus.succeeded,
          })),
        },
        ...slices,
      )
      const decoded = decodeWordInsert(assembled)
      expect(decoded.word).toBe('lacuna')
      expect(decoded.language).toBe('en')
    }).pipe(Effect.provide(MockContentEngine)),
  )

  it.effect('produce is deterministic — same (word, stage) yields identical content', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const a = yield* engine.produce(enumWordJobStage.fetch_source, enumLanguage.en, 'lacuna')
      const b = yield* engine.produce(enumWordJobStage.fetch_source, enumLanguage.en, 'lacuna')
      expect(a).toEqual(b)
    }).pipe(Effect.provide(MockContentEngine)),
  )

  it.effect('reserved demo word triggers not_found at fetch_source', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce(enumWordJobStage.fetch_source, enumLanguage.en, 'xyzzy')
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(ContentEngineError)
      expect(error.type).toBe('not_found')
    }).pipe(Effect.provide(MockContentEngine)),
  )

  it.effect('reserved demo word triggers failed at enrich_visuals', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce(enumWordJobStage.enrich_visuals, enumLanguage.en, 'kaboom')
        .pipe(Effect.flip)
      expect(error.type).toBe('failed')
    }).pipe(Effect.provide(MockContentEngine)),
  )
})

describe('MockContentEngine — injectable policy', () => {
  it.effect('surfaces the policy-configured failure type', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const error = yield* engine
        .produce(enumWordJobStage.fetch_source, enumLanguage.ru, 'whatever')
        .pipe(Effect.flip)
      expect(error.type).toBe('timed_out')
    }).pipe(Effect.provide(makeMockContentEngine(() => ({ kind: 'fail', type: 'timed_out' })))),
  )

  it.effect('a slow policy delays produce until the clock advances past the delay', () =>
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const done: Array<Record<string, unknown>> = []
      yield* Effect.forkChild(
        engine
          .produce(enumWordJobStage.fetch_source, enumLanguage.en, 'lacuna')
          .pipe(Effect.map((slice) => done.push(slice))),
      )

      yield* TestClock.adjust(Duration.millis(4999))
      expect(done).toHaveLength(0)

      yield* TestClock.adjust(Duration.millis(1))
      expect(done).toHaveLength(1)
    }).pipe(Effect.provide(makeMockContentEngine(() => ({ kind: 'produce', delayMillis: 5000 })))),
  )
})
