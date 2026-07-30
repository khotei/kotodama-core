import { describe, expect, it } from '@effect/vitest'
import { ASYNC_JOB_STATUSES, byAsyncJobStatus, enumAsyncJobStatus } from '../src/index'

describe('byAsyncJobStatus', () => {
  it('keys a record by exactly the status vocabulary (AC-2)', () => {
    expect(Object.keys(byAsyncJobStatus(() => 0))).toEqual([...ASYNC_JOB_STATUSES])
  })

  it('applies the value function per status — identity reproduces the enum map (AC-2)', () => {
    expect(byAsyncJobStatus((status) => status)).toEqual(enumAsyncJobStatus)
  })
})
