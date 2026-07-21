import type { Word } from '@kotodama/core-words'
import { type BuildStagesEntity, enumAsyncJobStatus, WORD_JOB_STAGES } from '@kotodama/database'
import { Array as Arr, Option, Order } from 'effect'
import type { StageProgress, WordStateView } from './word-state.view'

// `words.stages` is written in `WORD_JOB_STAGES` order, but sort defensively — declaration order is
// the pipeline order regardless of stored order.
const stageRank = new Map(WORD_JOB_STAGES.map((stage, index) => [stage, index] as const))

/**
 * The stepper payload: stages sorted into `WORD_JOB_STAGES` pipeline order, each carrying its
 * FE-facing error (present iff that stage failed; `cause` dropped). Shared by {@link
 * collapseWordState} and the `buildWord` handler, whose freshly-seeded build IS the running view.
 */
export const toStageProgress = (stages: BuildStagesEntity): StageProgress[] =>
  Arr.sort(
    stages,
    Order.mapInput(
      Order.Number,
      (stage: BuildStagesEntity[number]) => stageRank.get(stage.stage) ?? 0,
    ),
  ).map((entry) =>
    entry.error
      ? {
          stage: entry.stage,
          status: entry.status,
          error: { message: entry.error.message, type: entry.error.type },
        }
      : { stage: entry.stage, status: entry.status },
  )

/**
 * The single author of the state derivation for a word read. Pure — no I/O, unit-testable without a
 * database.
 *
 * Absence is the missing `words` row (`requestWordBuild` seeds it, so no row means nothing was
 * requested). Every present state carries the decoded {@link Word}'s own `status` verbatim (the row
 * and its inline `stages` are one write, so the status is authoritative): `succeeded` carries the
 * word, every other status carries the stepper read off the same row's `stages`. No status is
 * coerced — a value the view can't hold fails to typecheck here rather than being silently relabelled.
 */
export const collapseWordState = (word: Option.Option<Word>): Option.Option<WordStateView> => {
  if (Option.isNone(word)) return Option.none()
  const value = word.value
  return Option.some(
    value.status === enumAsyncJobStatus.succeeded
      ? { status: value.status, word: value }
      : { status: value.status, stages: toStageProgress(value.stages) },
  )
}
