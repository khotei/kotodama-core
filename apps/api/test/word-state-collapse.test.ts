import { describe, expect, it } from '@effect/vitest'
import {
  type AsyncJobStatus,
  type BuildStagesEntity,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumWordJobStage,
  type JobErrorEntity,
  type StageEntity,
  type WordJobStage,
} from '@kotodama/core/database'
import type { ReadyWord, UnreadyWord, Word } from '@kotodama/core/words'
import { Option } from 'effect'
import { collapseWordState } from '../src/words/word-state-collapse'
import { assertStatus } from './words-api-test-utils'

// A `words.stages` entry — `collapseWordState` reads only `stage`/`status`/`error`. The error rides
// the stage it belongs to (present iff that stage failed).
const stage = (stage: WordJobStage, status: AsyncJobStatus, error?: JobErrorEntity): StageEntity =>
  error ? { stage, status, error } : { stage, status }

// The collapse keys every branch off the decoded `Word` union's own `status` (the `words` row and
// its inline `stages` are one write, so the status is authoritative). The succeeded branch embeds +
// reads only `.word`, so a minimal cast suffices; the unready branch reads `.stages`, so those are
// real. `stages` on the ready fixture models the pre-collapse state a ready word still carries.
const ready = (stages: BuildStagesEntity = []): Option.Option<Word> =>
  Option.some({ word: 'lacuna', status: enumAsyncJobStatus.succeeded, stages } as ReadyWord)
const building = (status: UnreadyWord['status'], stages: BuildStagesEntity): Option.Option<Word> =>
  Option.some({ word: 'lacuna', language: 'en', status, stages } as UnreadyWord)
const NO_WORD = Option.none<Word>()

describe('collapseWordState', () => {
  it('succeeded: a ready word wins over its stages, carrying the word row', () => {
    const state = Option.getOrThrow(
      collapseWordState(ready([stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.running)])),
    )
    assertStatus(state, 'succeeded')
    expect(state.word.word).toBe('lacuna')
  })

  it('discriminant from status: a present non-succeeded word collapses off its stages, not to succeeded (AC-14)', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('running', [stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.running)]),
      ),
    )
    // The word exists but its `status` is `running`, so the state is the stage-derived `running` view —
    // presence alone must not win the succeeded branch (the pre-F-CONT-006 behaviour).
    assertStatus(state, 'running')
    expect(state.stages).toContainEqual({
      stage: enumWordJobStage.fetch_source,
      status: enumAsyncJobStatus.running,
    })
  })

  it('absent: no word → Option.none', () => {
    expect(Option.isNone(collapseWordState(NO_WORD))).toBe(true)
  })

  it('pending: a pending word surfaces as `pending`, not folded to `running`', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('pending', [stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.pending)]),
      ),
    )
    assertStatus(state, 'pending')
    expect(state.stages).toContainEqual({
      stage: enumWordJobStage.fetch_source,
      status: enumAsyncJobStatus.pending,
    })
  })

  it('running: a running word surfaces its stages as the running stepper', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('running', [
          stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.running),
          stage(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
        ]),
      ),
    )
    assertStatus(state, 'running')
    expect(state.stages).toEqual([
      { stage: enumWordJobStage.fetch_source, status: enumAsyncJobStatus.running },
      { stage: enumWordJobStage.enrich_etymology, status: enumAsyncJobStatus.pending },
    ])
  })

  it('orders stages by WORD_JOB_STAGES declaration order regardless of input order', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('running', [
          stage(enumWordJobStage.final_review, enumAsyncJobStatus.pending),
          stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.succeeded),
          stage(enumWordJobStage.enrich_tiers, enumAsyncJobStatus.pending),
        ]),
      ),
    )
    assertStatus(state, 'running')
    expect(state.stages.map((s) => s.stage)).toEqual([
      enumWordJobStage.fetch_source,
      enumWordJobStage.enrich_tiers,
      enumWordJobStage.final_review,
    ])
  })

  it('failed: a failed stage carries the FE-facing error on its own stage (no cause)', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('failed', [
          stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
            cause: 'debug-only',
          }),
          stage(enumWordJobStage.enrich_etymology, enumAsyncJobStatus.pending),
        ]),
      ),
    )
    assertStatus(state, 'failed')
    const failed = state.stages.find((s) => s.stage === enumWordJobStage.fetch_source)
    expect(failed?.error).toEqual({ message: 'no source found', type: enumJobErrorType.not_found })
    expect(failed?.error).not.toHaveProperty('cause')
  })

  it('failed: every failed stage keeps its own error, not just the first', () => {
    const state = Option.getOrThrow(
      collapseWordState(
        building('failed', [
          stage(enumWordJobStage.enrich_tiers, enumAsyncJobStatus.failed, {
            message: 'tier timeout',
            type: enumJobErrorType.timed_out,
            cause: 'debug-only',
          }),
          stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
            cause: 'debug-only',
          }),
        ]),
      ),
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
      collapseWordState(
        building('failed', [stage(enumWordJobStage.fetch_source, enumAsyncJobStatus.failed)]),
      ),
    )
    expect(state.status).toBe('failed')
  })
})
