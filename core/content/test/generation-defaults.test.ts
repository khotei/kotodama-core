import { describe, expect, it } from '@effect/vitest'
import { enumVisualKind } from '@kotodama/core/database'
import type { ImageOptions } from '@kotodama/platform/ai'
import { imageOptionsFor } from '../src/generation-defaults'

// AC-12 is a compile-time contract: the `@ts-expect-error` lines fail `tsc` unless `kind`/`size` are
// closed unions (an unused directive is itself a type error). The runtime asserts the model routing.
describe('imageOptionsFor', () => {
  it('routes hero to the premium model and every other role to the lighter one (AC-12)', () => {
    expect(imageOptionsFor(enumVisualKind.hero).model).toBe('gpt-image-2')
    expect(imageOptionsFor(enumVisualKind.infographic).model).toBe('gpt-image-1.5')
    expect(imageOptionsFor('author').model).toBe('gpt-image-1.5')
  })

  it('rejects a non-role kind at compile time (AC-12)', () => {
    // @ts-expect-error `kind` is a closed union (enumVisualKind members + 'author'); a typo must not compile.
    imageOptionsFor('not-a-role')
  })

  it('rejects an out-of-enum image size at compile time (AC-12)', () => {
    // @ts-expect-error `ImageOptions.size` is the closed OpenAI size union; an invalid size must not compile.
    const bad: ImageOptions = { model: 'gpt-image-2', size: '999x999', quality: 'low' }
    expect(bad).toBeDefined()
  })
})
