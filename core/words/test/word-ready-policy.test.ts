import { describe, expect, it } from '@effect/vitest'
import { enumAsyncJobStatus } from '@lexiai/database'
import { Effect } from 'effect'
import type { ReadyWord, UnreadyWord } from '../src/word.schema'
import { ensureReadyWord } from '../src/word-ready-policy'

// The gate is pure (`R = never`) — it discriminates an already-decoded `Word` off `status` alone, so a
// minimal cast suffices (mirrors `word-build-policy.test.ts`); decode correctness (ready ⇒ full
// content) is `word.schema.test.ts`'s seam, not re-asserted here.
const ready = { word: 'lacuna', status: enumAsyncJobStatus.succeeded } as ReadyWord
const unready = (status: UnreadyWord['status']) => ({ word: 'lacuna', status }) as UnreadyWord

describe('ensureReadyWord', () => {
  it('succeeded → passes the ReadyWord through (AC-12)', () => {
    expect(Effect.runSync(ensureReadyWord(ready))).toBe(ready)
  })

  for (const status of [
    enumAsyncJobStatus.pending,
    enumAsyncJobStatus.running,
    enumAsyncJobStatus.failed,
  ] as const) {
    it(`${status} → WordNotReadyError (AC-12)`, () => {
      const error = Effect.runSync(ensureReadyWord(unready(status)).pipe(Effect.flip))
      expect(error._tag).toBe('WordNotReadyError')
    })
  }
})
