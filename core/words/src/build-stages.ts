import {
  type AsyncJobStatus,
  type BuildStagesEntity,
  WORD_JOB_STAGES,
} from '@kotodama/core/database'

/**
 * Every pipeline stage at one status — the request seed (`pending`), the running flip, and the
 * succeeded promote. The single author of the uniform `words.stages` payload; the failure cases
 * (a per-stage error partition) are built where the flow knows them.
 */
export const stagesAll = (status: AsyncJobStatus): BuildStagesEntity =>
  WORD_JOB_STAGES.map((stage) => ({ stage, status }))
