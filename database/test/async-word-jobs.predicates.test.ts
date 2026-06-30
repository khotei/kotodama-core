import { describe, expect, it } from '@effect/vitest'
import { enumAsyncJobStatus, isTerminallyFailed } from '../src/index'

// Pure predicate — no DB. Owns the "what counts as a terminal failure" decision both consumers compose.
describe('isTerminallyFailed', () => {
  it('a failed stage is terminal — regardless of error payload (AC-5)', () => {
    expect(isTerminallyFailed({ status: enumAsyncJobStatus.failed })).toBe(true)
  })

  it('every non-failed status is not terminal (AC-5)', () => {
    expect(isTerminallyFailed({ status: enumAsyncJobStatus.pending })).toBe(false)
    expect(isTerminallyFailed({ status: enumAsyncJobStatus.running })).toBe(false)
    expect(isTerminallyFailed({ status: enumAsyncJobStatus.succeeded })).toBe(false)
  })
})
