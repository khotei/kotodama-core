import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  isTerminallyFailed,
  WORD_JOB_STAGES,
  type WordRow,
} from '@lexiai/database'
import { Array as Arr, Option, Order } from 'effect'
import type { JobErrorView, StageProgress, WordStateView } from './word-state.view'

/**
 * Stepper rank by `WORD_JOB_STAGES` declaration order — the single source of pipeline order
 * (`drizzle-effect.md`). Repos return stage rows unordered; ordering is the consumer's job.
 */
const stageRank = new Map(WORD_JOB_STAGES.map((stage, index) => [stage, index] as const))

/**
 * The pure four-state collapse: a snapshot (`{ word, stages }`) resolves to the {@link WordStateView} a consumer
 * reads, or `Option.none` when nothing has been requested (no word, no stages). A `words` row ⇒
 * `succeeded`; otherwise any terminally-failed stage ⇒ `failed`, else active stages ⇒ `running`. Each
 * failed stage carries its own {@link JobErrorView}, so a build that fails on more than one stage loses
 * no reason — the function models exactly what its `stages` input can express, not the worker's current
 * one-failure-at-a-time sequencing (a guarantee held in another module). Stages ride in `WORD_JOB_STAGES`
 * pipeline order regardless of how the rows were seeded.
 *
 * The **single author** of the view derivation, living at the API edge that owns the wire contract: the
 * GET-state handler hands it a snapshot and the build handler collapses the just-seeded rows
 * (`{ word: none, stages: seeded }`); neither recomputes the collapse. Pure (no I/O), so the four-state
 * logic is unit-testable without a database.
 */
export const collapseWordState = (snapshot: {
  word: Option.Option<WordRow>
  stages: readonly AsyncWordJobRow[]
}): Option.Option<WordStateView> => {
  if (Option.isSome(snapshot.word))
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
