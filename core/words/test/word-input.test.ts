import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { normalizeWordInput, parseWordInput } from '../src/word-input'

describe('normalizeWordInput', () => {
  it('keeps a single word and flags it as not trimmed', () => {
    expect(normalizeWordInput('lacuna')).toEqual({
      _tag: 'word',
      word: 'lacuna',
      trimmedToFirstWord: false,
    })
  })

  it('takes the first word of a phrase and flags the trim (AC-10)', () => {
    expect(normalizeWordInput('lacuna ipsum dolor')).toEqual({
      _tag: 'word',
      word: 'lacuna',
      trimmedToFirstWord: true,
    })
  })

  it('trims surrounding and collapses inner whitespace before taking the first word', () => {
    expect(normalizeWordInput('   hello   world  ')).toEqual({
      _tag: 'word',
      word: 'hello',
      trimmedToFirstWord: true,
    })
  })

  it('preserves intra-word hyphens', () => {
    expect(normalizeWordInput('well-being today')).toEqual({
      _tag: 'word',
      word: 'well-being',
      trimmedToFirstWord: true,
    })
  })

  it('accepts non-ASCII letters (RU)', () => {
    expect(normalizeWordInput('привет мир')).toEqual({
      _tag: 'word',
      word: 'привет',
      trimmedToFirstWord: true,
    })
  })

  it('rejects empty / whitespace-only input (AC-11)', () => {
    expect(normalizeWordInput('')).toEqual({ _tag: 'invalid' })
    expect(normalizeWordInput('   ')).toEqual({ _tag: 'invalid' })
  })

  it('rejects input whose first token has no letter — symbol-only (AC-11)', () => {
    expect(normalizeWordInput('!!!')).toEqual({ _tag: 'invalid' })
    expect(normalizeWordInput('@#$ %^&')).toEqual({ _tag: 'invalid' })
  })
})

describe('parseWordInput', () => {
  it.effect('succeeds with the normalized word', () =>
    Effect.gen(function* () {
      expect(yield* parseWordInput('lacuna ipsum')).toBe('lacuna')
    }),
  )

  it.effect('fails InvalidWordInputError for symbol-only input (AC-11)', () =>
    Effect.gen(function* () {
      const error = yield* parseWordInput('!!!').pipe(Effect.flip)
      expect(error._tag).toBe('InvalidWordInputError')
      expect(error.input).toBe('!!!')
    }),
  )
})
