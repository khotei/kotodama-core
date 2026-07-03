import type { Word } from '@lexiai/core-words'
import { type AsyncWordJobRow, enumAsyncJobStatus, WORD_JOB_STAGES } from '@lexiai/database'
import { Array as Arr, Option, Order } from 'effect'
import type { StageProgress, WordStateView } from './word-state.view'

// Repos return stage rows unordered; `WORD_JOB_STAGES` declaration order is the pipeline order.
const stageRank = new Map(WORD_JOB_STAGES.map((stage, index) => [stage, index] as const))

/**
 * The stepper payload: stage rows sorted into `WORD_JOB_STAGES` pipeline order, each carrying its
 * FE-facing error (present iff that stage failed; `cause` dropped). Shared by {@link
 * collapseWordState} and the `buildWord` handler, whose freshly-seeded build IS the running view.
 */
export const toStageProgress = (stages: readonly AsyncWordJobRow[]): StageProgress[] =>
  Arr.sort(
    stages,
    Order.mapInput(Order.Number, (row: AsyncWordJobRow) => stageRank.get(row.stage) ?? 0),
  ).map((row) =>
    row.error
      ? {
          stage: row.stage,
          status: row.status,
          error: { message: row.error.message, type: row.error.type },
        }
      : { stage: row.stage, status: row.status },
  )

/**
 * The single author of the state derivation for a read snapshot. Pure — no I/O, unit-testable
 * without a database.
 *
 * Absence is the missing `words` row (`buildWord` seeds row + stages atomically, so no row means
 * nothing was requested). Every present state carries the decoded {@link Word}'s own `status`
 * verbatim (the row is flipped in the same batch as its stages, so its status is authoritative):
 * `succeeded` carries the word, every other status carries the stepper. No status is coerced — a
 * value the view can't hold fails to typecheck here rather than being silently relabelled.
 */
export const collapseWordState = (snapshot: {
  word: Option.Option<Word>
  stages: readonly AsyncWordJobRow[]
}): Option.Option<WordStateView> => {
  if (Option.isNone(snapshot.word)) return Option.none()
  const word = snapshot.word.value
  return Option.some(
    word.status === enumAsyncJobStatus.succeeded
      ? { status: word.status, word }
      : { status: word.status, stages: toStageProgress(snapshot.stages) },
  )
}
