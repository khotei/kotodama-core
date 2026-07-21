import {
  enumAsyncJobStatus,
  JobErrorEntity,
  StageEntity,
  WordEntity,
} from '@kotodama/core/database'
import { Schema, Struct } from 'effect'

// `cause` is debugging-only and never FE-facing; omit keeps the rest from drifting.
export const JobErrorView = JobErrorEntity.mapFields(Struct.omit(['cause']))
export type JobErrorView = typeof JobErrorView.Type

/**
 * One stage of the stepper. The error rides the stage it belongs to (present iff that stage
 * failed), so a build failing on several stages surfaces every reason — there is no single
 * top-level error. The consumer sorts into `WORD_JOB_STAGES` pipeline order.
 */
export const StageProgress = Schema.Struct({
  ...StageEntity.mapFields(Struct.pick(['stage', 'status'])).fields,
  error: Schema.optionalKey(JobErrorView),
})
export type StageProgress = typeof StageProgress.Type

/**
 * The wire state of a `(word, language)`, faithful to the `words` row's own lifecycle `status` —
 * it mirrors the `Word` union: `succeeded` carries the rendered word; `pending` / `running` /
 * `failed` (the same `Literals` set `UnreadyWord` spans) carry the stepper, the discriminant saying
 * where the build is. The status is never coerced, so a status the view can't represent is a
 * `collapseWordState` compile error, not a silent relabel. Absence (nothing requested) is not a
 * variant — the producer returns `Option.none` (`null` on the wire).
 */
export const WordStateView = Schema.Union([
  Schema.Struct({ status: Schema.Literal(enumAsyncJobStatus.succeeded), word: WordEntity }),
  Schema.Struct({
    status: Schema.Literals([
      enumAsyncJobStatus.pending,
      enumAsyncJobStatus.running,
      enumAsyncJobStatus.failed,
    ]),
    stages: Schema.Array(StageProgress),
  }),
])
export type WordStateView = typeof WordStateView.Type

export type WordStatus = WordStateView['status']
