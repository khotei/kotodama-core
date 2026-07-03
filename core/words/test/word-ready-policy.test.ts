import { describe, expect, it } from '@effect/vitest'
import { enumAsyncJobStatus } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { Effect } from 'effect'
import type { UnreadyWord, Word } from '../src/word.schema'
import { ensureReadyWord } from '../src/word-ready-policy'

// The gate now DECODES the ready leaf, not just the `status` discriminant — so a ready fixture must
// carry full content (mirrors `word.schema.test.ts`'s DB-free row build). Decode correctness
// (ready ⇒ complete content) is that file's seam; here we assert the gate's wiring: a real ready
// word passes, and anything short of one — including a `succeeded` shell — is a `WordNotReadyError`.
const ENVELOPE = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
}

const ready = {
  ...ENVELOPE,
  ...makeWordInsert({ word: 'lacuna', language: 'en' }),
} as unknown as Word
const unready = (status: UnreadyWord['status']) =>
  ({ ...ENVELOPE, word: 'lacuna', language: 'en', status }) as unknown as Word

describe('ensureReadyWord', () => {
  it.effect('a full ready word → decodes and passes the ReadyWord through (AC-12)', () =>
    Effect.gen(function* () {
      const result = yield* ensureReadyWord(ready)
      expect(result.status).toBe(enumAsyncJobStatus.succeeded)
      expect(result.word).toBe('lacuna')
      expect(result.coreDefinition).toEqual(expect.any(String))
    }),
  )

  // The point of the decode: a `succeeded` status alone is NOT enough — a content-less shell is
  // rejected, not cast through as a broken `ReadyWord`.
  it.effect('succeeded status but no content → WordNotReadyError, not trusted (AC-12)', () =>
    Effect.gen(function* () {
      const shell = {
        ...ENVELOPE,
        word: 'lacuna',
        language: 'en',
        status: enumAsyncJobStatus.succeeded,
      } as unknown as Word
      const error = yield* ensureReadyWord(shell).pipe(Effect.flip)
      expect(error._tag).toBe('WordNotReadyError')
    }),
  )

  for (const status of [
    enumAsyncJobStatus.pending,
    enumAsyncJobStatus.running,
    enumAsyncJobStatus.failed,
  ] as const) {
    it.effect(`${status} → WordNotReadyError (AC-12)`, () =>
      Effect.gen(function* () {
        const error = yield* ensureReadyWord(unready(status)).pipe(Effect.flip)
        expect(error._tag).toBe('WordNotReadyError')
      }),
    )
  }
})
