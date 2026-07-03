import { isTerminallyFailed } from '@lexiai/core-async-word-jobs'
import type { Word } from '@lexiai/core-words'
import { type AsyncWordJobRow, enumAsyncJobStatus, WORD_JOB_STAGES } from '@lexiai/database'
import { Array as Arr, Option, Order } from 'effect'
import type { StageProgress, WordStateView } from './word-state.view'

// Repos return stage rows unordered; `WORD_JOB_STAGES` declaration order is the pipeline order.
const stageRank = new Map(WORD_JOB_STAGES.map((stage, index) => [stage, index] as const))

/**
 * The single author of the state derivation (both handlers hand it a snapshot; neither recomputes
 * it). Pure — no I/O, unit-testable without a database. Takes the decoded {@link Word} union, not
 * a raw row, so the discriminant reads off the row's own `status` (presence alone no longer means
 * ready) and the `succeeded` branch carries a content-non-null word cast-free.
 */
export const collapseWordState = (snapshot: {
  word: Option.Option<Word>
  stages: readonly AsyncWordJobRow[]
}): Option.Option<WordStateView> => {
  if (Option.isSome(snapshot.word) && snapshot.word.value.status === enumAsyncJobStatus.succeeded)
    return Option.some({ status: enumAsyncJobStatus.succeeded, word: snapshot.word.value })
  if (snapshot.stages.length === 0) return Option.none()

  const ordered = Arr.sort(
    snapshot.stages,
    Order.mapInput(Order.Number, (row: AsyncWordJobRow) => stageRank.get(row.stage) ?? 0),
  )
  const stages: StageProgress[] = ordered.map((row) =>
    row.error
      ? {
          stage: row.stage,
          status: row.status,
          error: { message: row.error.message, type: row.error.type },
        }
      : { stage: row.stage, status: row.status },
  )
  const failed = ordered.some(isTerminallyFailed)
  return Option.some({
    status: failed ? enumAsyncJobStatus.failed : enumAsyncJobStatus.running,
    stages,
  })
}
