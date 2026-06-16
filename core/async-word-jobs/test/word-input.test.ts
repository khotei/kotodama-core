import { describe, expect, it } from '@effect/vitest'
import { normalizeWordInput } from '../src/word-input'

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
