import { expect, it } from '@effect/vitest'
import { isArray, toArray } from '../src/index'

it('toArray normalizes single / array / undefined', () => {
  expect(toArray(undefined)).toEqual([])
  expect(toArray('a')).toEqual(['a'])
  expect(toArray(['a', 'b'])).toEqual(['a', 'b'])
})

it('isReadonlyArray narrows the single-vs-array forms', () => {
  expect(isArray(['a'])).toBe(true)
  expect(isArray('a')).toBe(false)
})
