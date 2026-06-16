import { describe, expect, it } from '@effect/vitest'
import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumWordJobStage,
  type JobError,
  type WordJobStage,
  type WordRow,
} from '@lexiai/database'
import { Option } from 'effect'
import { assertStatus } from '../src/testing'
import { deriveWordState } from '../src/word-state-derive'
import { sampleWord } from './sample-word'

// `deriveWordState` reads only `stage`/`status`/`error`; the rest is storage envelope filled with
// defaults so the fixture conforms to `AsyncWordJobRow` (`$inferSelect`) without a database.
const stageRow = (
  stage: WordJobStage,
  status: AsyncWordJobRow['status'],
  error: JobError | null = null,
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

const READY = Option.some(sampleWord as WordRow)
const NO_WORD = Option.none<WordRow>()

describe('deriveWordState', () => {
  it('succeeded: a ready word wins over any stage rows, carrying the word row', () => {
    const state = Option.getOrThrow(
      deriveWordState(READY, [stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.running)]),
    )
    assertStatus(state, 'succeeded')
    expect(state.word.word).toBe('lacuna')
  })

  it('absent: no word and no stages → Option.none', () => {
    expect(Option.isNone(deriveWordState(NO_WORD, []))).toBe(true)
  })

  it('running: active stages, no terminal failure', () => {
    const state = Option.getOrThrow(
      deriveWordState(NO_WORD, [
        stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.running),
        stageRow(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
      ]),
    )
    assertStatus(state, 'running')
    expect(state.stages).toEqual([
      { stage: enumWordJobStage.fetch_source, status: enumAsyncJobStatus.running },
      { stage: enumWordJobStage.enrich_etymology, status: enumAsyncJobStatus.pending },
    ])
  })

  it('orders stages by WORD_JOB_STAGES declaration order regardless of input order', () => {
    const state = Option.getOrThrow(
      deriveWordState(NO_WORD, [
        stageRow(enumWordJobStage.final_review, enumAsyncJobStatus.pending),
        stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.succeeded),
        stageRow(enumWordJobStage.enrich_tiers, enumAsyncJobStatus.pending),
      ]),
    )
    assertStatus(state, 'running')
    expect(state.stages.map((s) => s.stage)).toEqual([
      enumWordJobStage.fetch_source,
      enumWordJobStage.enrich_tiers,
      enumWordJobStage.final_review,
    ])
  })

  it('failed: a terminal failed stage with an error → failed + the FE-facing error (no cause)', () => {
    const state = Option.getOrThrow(
      deriveWordState(NO_WORD, [
        stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, {
          message: 'no source found',
          type: enumJobErrorType.not_found,
          cause: 'debug-only',
        }),
        stageRow(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
      ]),
    )
    assertStatus(state, 'failed')
    expect(state.error).toEqual({ message: 'no source found', type: enumJobErrorType.not_found })
    expect(state.error).not.toHaveProperty('cause')
  })

  it('a failed stage with no error payload is not terminal → still running', () => {
    const state = Option.getOrThrow(
      deriveWordState(NO_WORD, [
        stageRow(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, null),
      ]),
    )
    expect(state.status).toBe('running')
  })
})
