import { type AsyncJobStatus, enumAsyncJobStatus } from '@lexiai/database'

/**
 * A stage row is **terminally failed** — its build is over, so a fresh build of the word may begin —
 * iff its status is `failed`. The single author of "what counts as a terminal failure" (a domain
 * policy, so it lives in core, not `database/`): the API state collapse (`collapseWordState`,
 * `apps/api`) reads it, and any future consumer of the rule comes here.
 *
 * There is deliberately **no `error != null` arm**. `async_word_jobs.error` is nullable, so a `failed`
 * row whose `error` is `null` is representable; treating that as "still in progress" wedged the word at
 * a permanent 409 (no path resets it). Any `failed` row is terminal — a malformed one is retryable,
 * the safe default.
 */
export const isTerminallyFailed = (row: { readonly status: AsyncJobStatus }): boolean =>
  row.status === enumAsyncJobStatus.failed
