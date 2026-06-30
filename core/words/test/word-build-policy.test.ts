import { describe, expect, it } from '@effect/vitest'
import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  enumJobErrorType,
  enumLanguage,
  enumWordJobStage,
  type WordRow,
} from '@lexiai/database'
import { Effect, Exit, Option } from 'effect'
import { ensureWordBuildable } from '../src/word-build-policy'

// The guard is pure (`R = never`) — it runs on any snapshot, no DB. It reads only `word` presence and
// each stage's `status`/`error`, so the WordRow is an opaque `Some` and a stage row is the minimal
// `$inferSelect` envelope.
type Snapshot = { word: Option.Option<WordRow>; stages: readonly AsyncWordJobRow[] }
const EN = enumLanguage.en
const WORD = Option.some({} as WordRow)
const NO_WORD = Option.none<WordRow>()

const stageRow = (
  status: AsyncWordJobRow['status'],
  error: AsyncWordJobRow['error'] = null,
): AsyncWordJobRow => ({
  id: 'id-fetch_source',
  word: 'lacuna',
  language: EN,
  stage: enumWordJobStage.fetch_source,
  status,
  result: null,
  error,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-06-11T00:00:00.000Z'),
  updatedAt: new Date('2026-06-11T00:00:00.000Z'),
})

const buildable = (snapshot: Snapshot) =>
  Exit.isSuccess(Effect.runSyncExit(ensureWordBuildable(snapshot)))

const rejectionTag = (snapshot: Snapshot) =>
  Effect.runSync(ensureWordBuildable(snapshot).pipe(Effect.flip))._tag

describe('ensureWordBuildable', () => {
  it('absent (no word, no stages) → buildable', () => {
    expect(buildable({ word: NO_WORD, stages: [] })).toBe(true)
  })

  it('terminally failed (a stage failed with an error) → buildable (a retry)', () => {
    expect(
      buildable({
        word: NO_WORD,
        stages: [
          stageRow(enumAsyncJobStatus.failed, {
            message: 'no source found',
            type: enumJobErrorType.not_found,
          }),
        ],
      }),
    ).toBe(true)
  })

  it('ready (a words row exists) → WordAlreadyReadyError, even over active stages', () => {
    expect(rejectionTag({ word: WORD, stages: [] })).toBe('WordAlreadyReadyError')
    expect(rejectionTag({ word: WORD, stages: [stageRow(enumAsyncJobStatus.running)] })).toBe(
      'WordAlreadyReadyError',
    )
  })

  it('active stages, no terminal failure → WordBuildInProgressError', () => {
    expect(rejectionTag({ word: NO_WORD, stages: [stageRow(enumAsyncJobStatus.running)] })).toBe(
      'WordBuildInProgressError',
    )
    expect(rejectionTag({ word: NO_WORD, stages: [stageRow(enumAsyncJobStatus.pending)] })).toBe(
      'WordBuildInProgressError',
    )
  })

  it('a failed stage with no error payload is still terminal → buildable (AC-5)', () => {
    expect(buildable({ word: NO_WORD, stages: [stageRow(enumAsyncJobStatus.failed, null)] })).toBe(
      true,
    )
  })
})
