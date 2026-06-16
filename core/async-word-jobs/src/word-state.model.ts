import { AsyncWordJobEntity, enumAsyncJobStatus, JobError, WordEntity } from '@lexiai/database'
import { Schema, Struct } from 'effect'

/**
 * The word-state contract — what a `(word, language)` *is* on the wire, owned by its producer
 * {@link import('./word-build-state.service').WordBuildState} (the one place the four-state derivation
 * lives; the API contract composes it, never recomputes it). Every leaf shape derives from an entity /
 * content schema (`WordEntity`, `AsyncWordJobEntity`, `JobError`); only the discriminant + the
 * union assembly are authored here.
 */

/**
 * One stage's progress — the unit the `running`/`failed` stepper renders. A projection of
 * {@link AsyncWordJobEntity} to its two stepper fields, so the wire shape can't drift from the job row,
 * carries no `result`/`error`/timestamps, and validates `stage`/`status` against the DB enums. The
 * consumer sorts into pipeline order (the `WORD_JOB_STAGES` order authority in `database/`).
 */
export const StageProgress = AsyncWordJobEntity.mapFields(Struct.pick(['stage', 'status']))
export type StageProgress = typeof StageProgress.Type

/**
 * The FE-facing build error: the typed reason a build ended in `failed`. {@link JobError} (the authored
 * content schema) minus `cause` — debugging-only, never FE-facing — via `omit`, so it can't drift from
 * `JobError`.
 */
export const JobErrorView = JobError.mapFields(Struct.omit(['cause']))
export type JobErrorView = typeof JobErrorView.Type

/**
 * The explicit state of a `(word, language)`, discriminated by `status` so a consumer reads the state
 * directly instead of deriving it from nullable fields:
 * - `succeeded` — a `words` row exists; carries the rendered {@link WordEntity} row.
 * - `running` — an active build with no terminal error; carries the stage stepper.
 * - `failed` — a build ended on a terminal {@link JobErrorView}; carries the stepper + the error.
 *
 * All three discriminants reuse the `enumAsyncJobStatus` job-status values (one source); `running` is the
 * aggregate of active stages (`pending`/`running`, no terminal failure) — `pending` is the only job
 * status with no word-state of its own. Absence (no word, no stages) is **not** a variant — the producer returns `Option.none`
 * (`null` on the wire), mirroring `WordFinder`. A pure read shape — resolving a state never creates
 * either half. Modelled as a `status`-keyed union (the discriminant field is `status`, not a generic
 * `_tag`) so it reads as a state name on the wire.
 */
export const WordStateModel = Schema.Union([
  Schema.Struct({ status: Schema.Literal(enumAsyncJobStatus.succeeded), word: WordEntity }),
  Schema.Struct({
    status: Schema.Literal(enumAsyncJobStatus.running),
    stages: Schema.Array(StageProgress),
  }),
  Schema.Struct({
    status: Schema.Literal(enumAsyncJobStatus.failed),
    stages: Schema.Array(StageProgress),
    error: JobErrorView,
  }),
])
export type WordStateModel = typeof WordStateModel.Type

/** The state names — derived from the union's discriminant, not a separate list (no drift). */
export type WordStatus = WordStateModel['status']
