import { AsyncWordJobEntity, enumAsyncJobStatus, JobError, WordEntity } from '@lexiai/database'
import { Schema, Struct } from 'effect'

/**
 * The word-state contract — what a `(word, language)` *is* on the wire. The four-state derivation lives
 * in one place, {@link import('./word-state-collapse').collapseWordState}; the handler fetches a
 * snapshot (`{ word, stages }`) and hands it there (the API contract
 * composes the shape, never recomputes the collapse). Every leaf shape derives from an entity / content
 * schema (`WordEntity`, `AsyncWordJobEntity`, `JobError`); only the discriminant + the union assembly
 * are authored here. This is a **view model** — it lives at the API edge that owns the wire contract,
 * not in `core/` (see `apps/api/CLAUDE.md`).
 */

/**
 * The FE-facing build error: the typed reason a stage ended in `failed`. {@link JobError} (the authored
 * content schema) minus `cause` — debugging-only, never FE-facing — via `omit`, so it can't drift from
 * `JobError`.
 */
export const JobErrorView = JobError.mapFields(Struct.omit(['cause']))
export type JobErrorView = typeof JobErrorView.Type

/**
 * One stage's progress — the unit the `running`/`failed` stepper renders. A projection of
 * {@link AsyncWordJobEntity} to its two stepper fields plus the failed stage's own {@link JobErrorView}:
 * the error rides the stage it belongs to (present iff that stage failed), so a build that fails on more
 * than one stage surfaces every reason with its stage attribution — there is no single top-level error.
 * The wire shape can't drift from the job row, carries no `result`/timestamps, and validates
 * `stage`/`status` against the DB enums. The consumer sorts into pipeline order (the `WORD_JOB_STAGES`
 * order authority in `database/`).
 */
export const StageProgress = Schema.Struct({
  ...AsyncWordJobEntity.mapFields(Struct.pick(['stage', 'status'])).fields,
  error: Schema.optionalKey(JobErrorView),
})
export type StageProgress = typeof StageProgress.Type

/**
 * The explicit state of a `(word, language)`, discriminated by `status` so a consumer reads the state
 * directly instead of deriving it from nullable fields:
 * - `succeeded` — a `words` row exists; carries the rendered {@link WordEntity} row.
 * - `running` — an active build with no terminal failure; carries the stage stepper.
 * - `failed` — a build ended with ≥1 terminally-failed stage; carries the stepper, each failed stage
 *   holding its own {@link JobErrorView} (`stages.filter(s => s.error)`), so multiple failures aren't lost.
 *
 * `running` and `failed` carry the identical `stages` shape — the discriminant alone tells a consumer
 * whether the build is still advancing or terminally done, without scanning the stepper. All three
 * discriminants reuse the `enumAsyncJobStatus` job-status values (one source); `running` is the
 * aggregate of active stages (`pending`/`running`, no terminal failure) — `pending` is the only job
 * status with no word-state of its own. Absence (no word, no stages) is **not** a variant — the producer returns `Option.none`
 * (`null` on the wire), mirroring `selectWord`. A pure read shape — resolving a state never creates
 * either half. Modelled as a `status`-keyed union (the discriminant field is `status`, not a generic
 * `_tag`) so it reads as a state name on the wire.
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

/** The state names — derived from the union's discriminant, not a separate list (no drift). */
export type WordStatus = WordStateView['status']
