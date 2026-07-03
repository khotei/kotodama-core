import { describe, expect, it } from '@effect/vitest'
import { type AsyncJobStatus, enumAsyncJobStatus, type WordRow } from '@lexiai/database'
import { Effect, Exit, Option } from 'effect'
import { ensureWordBuildable } from '../src/word-build-policy'

// The guard is pure (`R = never`) — it runs on any row, no DB. It reads only the single row's `status`,
// so the WordRow is a minimal `$inferSelect` envelope with just the status set.
const wordRow = (status: AsyncJobStatus): WordRow => ({ status }) as WordRow

const buildable = (word: Option.Option<WordRow>) =>
  Exit.isSuccess(Effect.runSyncExit(ensureWordBuildable(word)))

const rejectionTag = (word: Option.Option<WordRow>) =>
  Effect.runSync(ensureWordBuildable(word).pipe(Effect.flip))._tag

describe('ensureWordBuildable', () => {
  it('absent (no words row) → buildable (AC-13)', () => {
    expect(buildable(Option.none())).toBe(true)
  })

  it('failed (a failed words row) → buildable — a retry, not an error (AC-13)', () => {
    expect(buildable(Option.some(wordRow(enumAsyncJobStatus.failed)))).toBe(true)
  })

  it('succeeded → WordAlreadyReadyError (AC-13)', () => {
    expect(rejectionTag(Option.some(wordRow(enumAsyncJobStatus.succeeded)))).toBe(
      'WordAlreadyReadyError',
    )
  })

  it('pending → WordBuildInProgressError (AC-13)', () => {
    expect(rejectionTag(Option.some(wordRow(enumAsyncJobStatus.pending)))).toBe(
      'WordBuildInProgressError',
    )
  })

  it('running → WordBuildInProgressError (AC-13)', () => {
    expect(rejectionTag(Option.some(wordRow(enumAsyncJobStatus.running)))).toBe(
      'WordBuildInProgressError',
    )
  })
})
