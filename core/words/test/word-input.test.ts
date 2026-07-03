import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { normalizeWordInput, parseWordInput } from '../src/word-input'

describe('normalizeWordInput', () => {
  it('keeps a single word', () => {
    expect(normalizeWordInput('lacuna')).toEqual({ _tag: 'word', word: 'lacuna' })
  })

  it('keeps a short multi-word collocation verbatim (AC-13)', () => {
    expect(normalizeWordInput('faux pas')).toEqual({ _tag: 'word', word: 'faux pas' })
    expect(normalizeWordInput('stream of consciousness')).toEqual({
      _tag: 'word',
      word: 'stream of consciousness',
    })
  })

  it('trims surrounding and collapses inner whitespace (AC-13)', () => {
    expect(normalizeWordInput('   faux    pas  ')).toEqual({ _tag: 'word', word: 'faux pas' })
  })

  it('preserves intra-word hyphens', () => {
    expect(normalizeWordInput('well-being today')).toEqual({
      _tag: 'word',
      word: 'well-being today',
    })
  })

  it('accepts non-ASCII letters (RU)', () => {
    expect(normalizeWordInput('привет мир')).toEqual({ _tag: 'word', word: 'привет мир' })
  })

  it('rejects empty / whitespace-only input', () => {
    expect(normalizeWordInput('')).toEqual({ _tag: 'invalid' })
    expect(normalizeWordInput('   ')).toEqual({ _tag: 'invalid' })
  })

  it('rejects input with no letter anywhere — symbol-only', () => {
    expect(normalizeWordInput('!!!')).toEqual({ _tag: 'invalid' })
    expect(normalizeWordInput('@#$ %^&')).toEqual({ _tag: 'invalid' })
  })
})

describe('parseWordInput', () => {
  it.effect('succeeds with the normalized word/collocation', () =>
    Effect.gen(function* () {
      expect(yield* parseWordInput('faux pas')).toBe('faux pas')
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
