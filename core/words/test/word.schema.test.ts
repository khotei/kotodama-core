import { describe, expect, it } from '@effect/vitest'
import { enumAsyncJobStatus } from '@kotodama/core/database'
import { makeWordInsert } from '@kotodama/core/database/factories'
import { Effect } from 'effect'
import { decodeWord } from '../src/word.schema'

// A `words` row is the permissive lifecycle row: identity + storage envelope + `status` + the 12
// nullable content columns. A ready row carries full content; a building row carries explicit nulls,
// exactly as the pg driver hands them back. The union decodes DIRECTLY from that row (no
// `transformOrFail`): the ready leaf needs every content field non-null; the building leaves ignore
// the null content as excess keys (Effect v4 strips excess on decode). DB-free.
const ENVELOPE = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
}
const CONTENT_KEYS = [
  'coreDefinition',
  'lexical',
  'pronunciation',
  'tiers',
  'etymology',
  'authorExamples',
  'culturalGuide',
  'relations',
  'translations',
  'visuals',
  'sources',
  'provenance',
  'frequency',
] as const

const readyRow = () => ({ ...ENVELOPE, ...makeWordInsert({ word: 'lacuna', language: 'en' }) })

/** A building row: identity + a non-succeeded status + every content column an explicit `null`. */
const buildingRow = (status: 'pending' | 'running' | 'failed') => ({
  ...ENVELOPE,
  word: 'lacuna',
  language: 'en' as const,
  status,
  stages: [],
  ...Object.fromEntries(CONTENT_KEYS.map((k) => [k, null])),
})

describe('Word union (decode from a words row)', () => {
  it.effect('succeeded: decodes to the ready leaf carrying full content (AC-7)', () =>
    Effect.gen(function* () {
      const word = yield* decodeWord(readyRow())
      expect(word.status).toBe(enumAsyncJobStatus.succeeded)
      if (word.status !== enumAsyncJobStatus.succeeded) return
      expect(word.word).toBe('lacuna')
      expect(word.coreDefinition).toEqual(expect.any(String))
      expect(word.lexical).toBeTruthy()
    }),
  )

  // The three building states decode identically: their null content columns are dropped as excess.
  for (const status of ['pending', 'running', 'failed'] as const) {
    it.effect(
      `${status}: decodes to a content-less leaf that omits every content field (AC-7)`,
      () =>
        Effect.gen(function* () {
          const word = yield* decodeWord(buildingRow(status))
          expect(word.status).toBe(status)
          expect(word.word).toBe('lacuna')
          for (const key of CONTENT_KEYS) expect(word).not.toHaveProperty(key)
        }),
    )
  }

  it.effect(
    'succeeded: a null frequency still decodes — frequency is outside the CHECK (AC-7)',
    () =>
      Effect.gen(function* () {
        const word = yield* decodeWord({ ...readyRow(), frequency: null })
        expect(word.status).toBe(enumAsyncJobStatus.succeeded)
      }),
  )

  // The ready leaf pins every CHECK column non-null, so a succeeded row missing ANY of them fails both
  // leaves (the ready leaf rejects the null; the building leaves reject the `succeeded` literal).
  for (const key of ['coreDefinition', 'lexical'] as const) {
    it.effect(
      `malformed: a succeeded row with null ${key} fails to decode (invariant at decode)`,
      () =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(decodeWord({ ...readyRow(), [key]: null }))
          expect(result._tag).toBe('Failure')
        }),
    )
  }
})
