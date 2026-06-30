import { createWord } from '@lexiai/core-words'
import { enumJobErrorType, type Language, WORD_JOB_STAGES } from '@lexiai/database'
import { stagePatch, upsertWordJobStages } from '@lexiai/repositories-async-word-jobs'
import { Effect } from 'effect'

/**
 * The build-run flow the worker invokes — it manages the **job** (`async_word_jobs`) around the
 * **word** (`createWord`, `@lexiai/core-words`). `createWord` generates the content and commits the
 * `words` row uninterruptibly; this flow only **records the outcome** onto the stages. The ownership
 * line: `core` writes `words`, this use-case writes `async_word_jobs`. Build-outcome-integrity
 * invariant: **a committed word is never journalled `timed_out`** — the generation budget (the
 * `WordGenerationServiceTimed` decorator, wired at the worker entrypoint) bounds generation (which
 * commits nothing) and `createWord` commits *after* that race resolves.
 *
 * No live tracking, no resume: the stages move in **one batch at the end**. Success ⇒ every stage
 * `succeeded`; a `WordGenerationError` carries the full picture (its `succeeded` passes recorded
 * `succeeded`, its `failed` passes `failed`; passes that never ran stay `pending`); a generation timeout
 * ⇒ every stage `timed_out` (no `words` row). Per-stage `result` is no longer reused, so a succeeded
 * stage stores `{}`; the real content lives in the `words` row.
 *
 * Error handling, by tag:
 * - **`TimeoutError`** (generation overran the budget) — every stage `timed_out`; no `words` row.
 * - **`WordGenerationError`** (a pass failed) — the recorded per-stage outcome; the flow then succeeds,
 *   so it never reaches the worker edge.
 * - **`EffectDrizzleQueryError` on the *success-path* journal write** (after the commit) — swallowed:
 *   the word is ready, so a redrive (which would regenerate) is wrong. A commit-path DB error instead
 *   propagates to the edge for a redrive (no row was written — a retry should re-attempt).
 *
 * A **bare function** (not a `Context.Service`): an app-flow composer. Its dependencies —
 * `createWord`'s `WordGenerationService | DB` and the repo's `DB` — ride the `R` channel; the worker
 * entrypoint provides them (the generation budget is baked into the `WordGenerationServiceTimed`
 * decorator there, not read here).
 *
 * @see `use-cases/CLAUDE.md`
 */
export const buildWord = Effect.fnUntraced(function* (language: Language, word: string) {
  yield* createWord(language, word).pipe(
    // Generation + commit succeeded → journal every stage `succeeded`. A transient journal-write error
    // *after* the commit is swallowed — the word is ready, so a redrive would wrongly regenerate it
    // (#2/AC-4); a commit-path error propagates (no row → the edge redrives).
    Effect.andThen(
      upsertWordJobStages(
        language,
        word,
        WORD_JOB_STAGES.map((stage) => stagePatch.succeeded(stage, {})),
      ).pipe(
        Effect.catchTag('EffectDrizzleQueryError', (error) =>
          Effect.logError(
            `word committed but its stage journal write failed for "${word}" (${language})`,
            error,
          ),
        ),
      ),
    ),
    // Generation expired its budget → record every stage `timed_out`; no `words` row was committed.
    Effect.catchTag('TimeoutError', () => {
      const message = 'generation exceeded its build budget'
      return Effect.logError(`word build timed out for "${word}" (${language}): ${message}`).pipe(
        Effect.andThen(
          upsertWordJobStages(
            language,
            word,
            WORD_JOB_STAGES.map((stage) =>
              stagePatch.failed(stage, { type: enumJobErrorType.timed_out, message }),
            ),
          ),
        ),
      )
    }),
    // A `WordGenerationError` is the *expected* domain outcome — record its full per-stage picture and
    // succeed, so it never reaches the worker edge.
    Effect.catchTag('WordGenerationError', ({ failures, succeeded }) =>
      Effect.logError(
        `word build failed for "${word}" (${language}): ${failures
          .map(({ stage, error }) => `${stage} (${error.type})`)
          .join(', ')}`,
      ).pipe(
        Effect.andThen(
          upsertWordJobStages(language, word, [
            ...succeeded.map((stage) => stagePatch.succeeded(stage, {})),
            ...failures.map(({ stage, error }) => stagePatch.failed(stage, error)),
          ]),
        ),
      ),
    ),
    // What remains is an infrastructure fault (a commit-path DB error) — not a recorded outcome. Log it
    // before it leaves for the worker-edge redrive so a redrive is never silent.
    Effect.tapError((error) =>
      Effect.logError(`word build errored for "${word}" (${language})`, error),
    ),
  )
})
