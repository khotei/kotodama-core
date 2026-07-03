import { describe, expect, it } from '@effect/vitest'
import { AiServiceTest } from '@kotodama/ai/testing'
import { Effect } from 'effect'
import { verifyWordInput, type WordVerdict } from '../src/verify-word-input'

const valid: WordVerdict = { isValid: true, reason: 'real word' }
const invalid: WordVerdict = { isValid: false, reason: 'gibberish' }

describe('verifyWordInput', () => {
  it.effect('admits a real word and returns the normalized form', () =>
    Effect.gen(function* () {
      expect(yield* verifyWordInput('lacuna')).toBe('lacuna')
    }).pipe(Effect.provide(AiServiceTest({ object: valid }))),
  )

  it.effect('admits a short collocation verbatim, no first-token trim (AC-13)', () =>
    Effect.gen(function* () {
      expect(yield* verifyWordInput('faux pas')).toBe('faux pas')
    }).pipe(Effect.provide(AiServiceTest({ object: valid }))),
  )

  it.effect('rejects empty / symbol-only input before any judge call → 422 (AC-10)', () =>
    Effect.gen(function* () {
      for (const raw of ['', '   ', '!!!', '@#$ %^&']) {
        const error = yield* verifyWordInput(raw).pipe(Effect.flip)
        expect(error._tag).toBe('InvalidWordInputError')
        expect(error.input).toBe(raw)
      }
      // No `object` fixture: if any of the above reached the judge it would fail-open (admit), so the
      // 422s above prove the pre-filter short-circuits before the judge (AC-10 "no LLM call").
    }).pipe(Effect.provide(AiServiceTest({}))),
  )

  it.effect(
    'rejects input over the char / word-count limit before any judge call → 422 (AC-10)',
    () =>
      Effect.gen(function* () {
        const overWords = yield* verifyWordInput('one two three four five').pipe(Effect.flip)
        expect(overWords._tag).toBe('InvalidWordInputError')
        const overChars = yield* verifyWordInput('a'.repeat(65)).pipe(Effect.flip)
        expect(overChars._tag).toBe('InvalidWordInputError')
      }).pipe(Effect.provide(AiServiceTest({}))),
  )

  it.effect('pre-filter passes but judge says isValid:false → 422 (AC-11)', () =>
    Effect.gen(function* () {
      const error = yield* verifyWordInput('asdfgh').pipe(Effect.flip)
      expect(error._tag).toBe('InvalidWordInputError')
      expect(error.input).toBe('asdfgh')
    }).pipe(Effect.provide(AiServiceTest({ object: invalid }))),
  )

  it.effect('judge call errors → admits the pre-filtered word (fail-open, AC-12)', () =>
    // No `object` fixture ⇒ `AiServiceTest.generateObject` fails with AiError, exercising fail-open.
    Effect.gen(function* () {
      expect(yield* verifyWordInput('lacuna')).toBe('lacuna')
    }).pipe(Effect.provide(AiServiceTest({}))),
  )
})
