import { expect, it } from '@effect/vitest'
import { isReadonlyArray, toArray } from '../src/index'

it('toArray normalizes single / array / undefined', () => {
  expect(toArray(undefined)).toEqual([])
  expect(toArray('a')).toEqual(['a'])
  expect(toArray(['a', 'b'])).toEqual(['a', 'b'])
})

it('isReadonlyArray narrows the single-vs-array forms', () => {
  expect(isReadonlyArray(['a'])).toBe(true)
  expect(isReadonlyArray('a')).toBe(false)
})
