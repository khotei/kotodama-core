import {
  type AsyncWordJobRow,
  enumAsyncJobStatus,
  WORD_JOB_STAGES,
  type WordRow,
} from '@lexiai/database'
import { Option } from 'effect'
import type { StageProgress, WordStateModel } from './word-state.model'

/**
 * Stepper rank by `WORD_JOB_STAGES` declaration order — the single source of pipeline order
 * (`drizzle-effect.md`). Repos return stage rows unordered; ordering is the consumer's job.
 */
const stageRank = new Map(WORD_JOB_STAGES.map((stage, index) => [stage, index] as const))

/**
 * The pure four-state collapse behind {@link import('./word-build-state.service').WordBuildState}: a
 * ready word + its stage rows resolve to the {@link WordStateModel} a consumer reads, or `Option.none`
 * when nothing has been requested (no word, no stages). A `words` row ⇒ `succeeded`; otherwise the
 * first terminal stage failure ⇒ `failed`, else active stages ⇒ `running`. Stages ride in
 * `WORD_JOB_STAGES` pipeline order regardless of how the rows were seeded.
 *
 * Pure (`R = never`, no I/O) — the fetch is the shell's job (`WordBuildState.get` / `WordBuildRequester`),
 * so the four-state logic is unit-testable without a database. The single author of the derivation.
 */
export const deriveWordState = (
  word: Option.Option<WordRow>,
  stageRows: readonly AsyncWordJobRow[],
): Option.Option<WordStateModel> => {
  if (Option.isSome(word))
    return Option.some({ status: enumAsyncJobStatus.succeeded, word: word.value })
  if (stageRows.length === 0) return Option.none()

  const ordered = [...stageRows].sort(
    (a, b) => (stageRank.get(a.stage) ?? 0) - (stageRank.get(b.stage) ?? 0),
  )
  const failed = ordered.find(
    (row) => row.status === enumAsyncJobStatus.failed && row.error != null,
  )
  const stages: StageProgress[] = ordered.map((row) => ({ stage: row.stage, status: row.status }))
  return Option.some(
    failed?.error
      ? {
          status: enumAsyncJobStatus.failed,
          stages,
          error: { message: failed.error.message, type: failed.error.type },
        }
      : { status: enumAsyncJobStatus.running, stages },
  )
}
