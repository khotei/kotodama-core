import { type AsyncJobStatus, enumAsyncJobStatus } from './async-word-jobs.values'

/**
 * A stage row is **terminally failed** — its build is over, so a fresh build of the word may begin —
 * iff its status is `failed`. The single author of "what counts as a terminal failure": both the
 * build-admission guard (`ensureWordBuildable`, `@lexiai/core-words`) and the API state collapse
 * (`collapseWordState`, `apps/api`) read it, so the rule lives in exactly one place.
 *
 * There is deliberately **no `error != null` arm**. `async_word_jobs.error` is nullable, so a `failed`
 * row whose `error` is `null` is representable; treating that as "still in progress" wedged the word at
 * a permanent 409 (no path resets it). Any `failed` row is terminal — a malformed one is retryable,
 * the safe default.
 */
export const isTerminallyFailed = (row: { readonly status: AsyncJobStatus }): boolean =>
  row.status === enumAsyncJobStatus.failed
