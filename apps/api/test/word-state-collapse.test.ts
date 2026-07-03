import { describe, expect, it } from '@effect/vitest'
import type { ReadyWord, UnreadyWord, Word } from '@kotodama/core-words'
import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumWordJobStage,
  type JobErrorEntity,
  type WordJobStage,
} from '@kotodama/database'
import { Option } from 'effect'
import { collapseWordState } from '../src/words/word-state-collapse'
import { assertStatus } from './words-api-test-utils'

// `collapseWordState` reads only `stage`/`status`/`error`; the rest is storage envelope filled with
// defaults so the fixture conforms to `AsyncWordJobRow` (`$inferSelect`) without a database.
const stageRow = (
  stage: WordJobStage,
  status: AsyncWordJobRow['status'],
  error: JobErrorEntity | null = null,
): AsyncWordJobRow => ({
  id: `id-${stage}`,
  word: 'lacuna',
  language: 'en',
  stage,
  status,
  result: null,
  error,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
})

// The collapse keys every branch off the decoded `Word` union's `status` (the `words` row is
// flipped in the same batch as its stages, so its own status is authoritative). The succeeded
// branch only embeds + reads `.word`, so a minimal cast suffices — no full-entity fixture.
const READY = Option.some({ word: 'lacuna', status: enumAsyncJobStatus.succeeded } as ReadyWord)
// A present-but-unready row (`pending`/`running`/`failed`) must NOT collapse to succeeded — the
// discriminant is the row's `status`, not the mere presence of a row (F-CONT-006, AC-14).
const BUILDING = Option.some({
  word: 'lacuna',
  status: enumAsyncJobStatus.running,
} as UnreadyWord)
const FAILED = Option.some({ word: 'lacuna', status: enumAsyncJobStatus.failed } as UnreadyWord)
const PENDING = Option.some({ word: 'lacuna', status: enumAsyncJobStatus.pending } as UnreadyWord)
const NO_WORD = Option.none<Word>()

describe('collapseWordState', () => {
  it('succeeded: a ready word wins over any stage rows, carrying the word row', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: READY,
        stages: [stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.running)],
      }),
    )
    assertStatus(state, 'succeeded')
    expect(state.word.word).toBe('lacuna')
  })

  it('discriminant from status: a present non-succeeded row collapses off its stages, not to succeeded (AC-14)', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: BUILDING,
        stages: [stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.running)],
      }),
    )
    // The row exists but its `status` is `running`, so the state is the stage-derived `running` view —
    // presence alone must not win the succeeded branch (the pre-F-CONT-006 behaviour).
    assertStatus(state, 'running')
    expect(state.stages).toContainEqual({
      stage: enumWordJobStage.fetch_source,
      status: enumAsyncJobStatus.running,
    })
  })

  it('absent: no word and no stages → Option.none', () => {
    expect(Option.isNone(collapseWordState({ word: NO_WORD, stages: [] }))).toBe(true)
  })

  it('pending: a pending row surfaces as `pending`, not folded to `running`', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: PENDING,
        stages: [stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.pending)],
      }),
    )
    assertStatus(state, 'pending')
    expect(state.stages).toContainEqual({
      stage: enumWordJobStage.fetch_source,
      status: enumAsyncJobStatus.pending,
    })
  })

  it('running: a running row surfaces its stages as the running stepper', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: BUILDING,
        stages: [
          stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.running),
          stageRow(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
        ],
      }),
    )
    assertStatus(state, 'running')
    expect(state.stages).toEqual([
      { stage: enumWordJobStage.fetch_source, status: enumAsyncJobStatus.running },
      { stage: enumWordJobStage.enrich_etymology, status: enumAsyncJobStatus.pending },
    ])
  })

  it('orders stages by WORD_JOB_STAGES declaration order regardless of input order', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: BUILDING,
        stages: [
          stageRow(enumWordJobStage.final_review, enumAsyncJobStatus.pending),
          stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.succeeded),
          stageRow(enumWordJobStage.enrich_tiers, enumAsyncJobStatus.pending),
        ],
      }),
    )
    assertStatus(state, 'running')
    expect(state.stages.map((s) => s.stage)).toEqual([
      enumWordJobStage.fetch_source,
      enumWordJobStage.enrich_tiers,
      enumWordJobStage.final_review,
    ])
  })

  it('failed: a failed row carries the FE-facing error on its own stage (no cause)', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: FAILED,
        stages: [
          stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
            cause: 'debug-only',
          }),
          stageRow(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
        ],
      }),
    )
    assertStatus(state, 'failed')
    const failed = state.stages.find((s) => s.stage === enumWordJobStage.fetch_source)
    expect(failed?.error).toEqual({ message: 'no source found', type: enumJobErrorType.not_found })
    expect(failed?.error).not.toHaveProperty('cause')
  })

  it('failed: every failed stage keeps its own error, not just the first', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: FAILED,
        stages: [
          stageRow(enumWordJobStage.enrich_tiers, enumAsyncJobStatus.failed, {
            message: 'tier timeout',
            type: enumJobErrorType.timed_out,
            cause: 'debug-only',
          }),
          stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
            cause: 'debug-only',
          }),
        ],
      }),
    )
    assertStatus(state, 'failed')
    // Errors ride their stage in pipeline order — both reasons survive, each attributed.
    expect(state.stages.flatMap((s) => (s.error ? [{ stage: s.stage, ...s.error }] : []))).toEqual([
      {
        stage: enumWordJobStage.fetch_source,
        message: 'no source found',
        type: enumJobErrorType.not_found,
      },
      {
        stage: enumWordJobStage.enrich_tiers,
        message: 'tier timeout',
        type: enumJobErrorType.timed_out,
      },
    ])
  })

  it('a failed stage with no error payload still maps cleanly → failed (AC-5)', () => {
    const state = Option.getOrThrow(
      collapseWordState({
        word: FAILED,
        stages: [stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, null)],
      }),
    )
    expect(state.status).toBe('failed')
  })
})
