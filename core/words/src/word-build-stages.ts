import {
  type AsyncJobStatus,
  WORD_BUILD_STAGES,
  type WordBuildStagesEntity,
} from '@kotodama/database'

/**
 * Every pipeline stage at one status — the request seed (`pending`), the running flip, and the
 * succeeded promote. The single author of the uniform `words.stages` payload; the failure cases
 * (a per-stage error partition) are built where the flow knows them.
 */
export function stagesAll(status: AsyncJobStatus): WordBuildStagesEntity {
  return WORD_BUILD_STAGES.map((stage) => ({ stage, status }))
}
