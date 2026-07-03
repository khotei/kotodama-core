import {
  AsyncWordJobEntity,
  enumAsyncJobStatus,
  JobErrorEntity,
  WordEntity,
} from '@lexiai/database'
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
  ...AsyncWordJobEntity.mapFields(Struct.pick(['stage', 'status'])).fields,
  error: Schema.optionalKey(JobErrorView),
})
export type StageProgress = typeof StageProgress.Type

/**
 * The wire state of a `(word, language)`: `succeeded` carries the rendered word; `running` /
 * `failed` carry the identical stepper shape — the discriminant alone says whether the build is
 * still advancing. `pending` is deliberately absent (an aggregate of active stages reads
 * `running`); absence (nothing requested) is not a variant — the producer returns `Option.none`
 * (`null` on the wire).
 */
export const WordStateView = Schema.Union([
  Schema.Struct({ status: Schema.Literal(enumAsyncJobStatus.succeeded), word: WordEntity }),
  Schema.Struct({
    status: Schema.Literal(enumAsyncJobStatus.running),
    stages: Schema.Array(StageProgress),
  }),
  Schema.Struct({
    status: Schema.Literal(enumAsyncJobStatus.failed),
    stages: Schema.Array(StageProgress),
  }),
])
export type WordStateView = typeof WordStateView.Type

export type WordStatus = WordStateView['status']
