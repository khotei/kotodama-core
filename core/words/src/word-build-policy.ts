import { type AsyncWordJobRow, isTerminallyFailed, type WordRow } from '@lexiai/database'
import { Effect, Option, Schema } from 'effect'

/**
 * The word is already Ready (a `words` row exists), so there is nothing to build. Maps to HTTP 409.
 * Payload-less: the `(language, word)` identity is the request URL (`POST /words/:language/:word/build`),
 * so echoing it in the body would be redundant.
 */
export class WordAlreadyReadyError extends Schema.TaggedErrorClass<WordAlreadyReadyError>()(
  'WordAlreadyReadyError',
  {},
  { httpApiStatus: 409 },
) {}

/** A build is already in progress for the word (active stages, no terminal failure). Maps to HTTP 409. */
export class WordBuildInProgressError extends Schema.TaggedErrorClass<WordBuildInProgressError>()(
  'WordBuildInProgressError',
  {},
  { httpApiStatus: 409 },
) {}

/**
 * The build-admission **guard** — the one-build-per-`(word, language)` policy, enforced here and nowhere
 * else. A **word-creation gate**, sibling to `parseWordInput` (the input gate, 422): it decides *whether
 * a word may be created*, so it lives with the word, not with the job machinery — it only **reads** the
 * job state as evidence, never operates on jobs. **Pure**: it takes just the already-fetched snapshot
 * halves — a structural `{ word, stages }`, inlined so the pure guard carries no dependency on a named
 * snapshot type — and **succeeds** (void) when a build may begin — an absent word or one whose
 * stages terminally `failed` (a retry). Every other state is a typed rejection rid in the `E` channel: a
 * present `word` ⇒ {@link WordAlreadyReadyError} (409), active stages with no terminal failure ⇒
 * {@link WordBuildInProgressError} (409). The rejections are payload-less — the `(language, word)` is the
 * request URL — so the guard needs no identity at all, only the state. Success carries no value — the
 * success *is* "you may proceed" — which is why it is `ensure…`, not a `boolean` predicate.
 *
 * It derives the verdict **directly from the two snapshot halves**, not via the view collapse: the
 * policy needs only "is there a ready word?" + "is there an active build?", a narrower question than the
 * stepper view answers. Both tables are load-bearing — `word` is the authority for `succeeded`
 * (the pristine invariant), `stages` for in-flight — so a stages-only check could not distinguish a
 * ready word from a finished-but-unwritten one; the `word`-wins precedence is the cross-table
 * tie-break. Being pure (no fetch, no I/O), a caller can ask "may *this* word be built?" of any
 * snapshot — a live read ({@link import('@lexiai/core-async-word-jobs').readWordBuildSnapshot}) or a
 * hand-built fixture — without a database.
 *
 * @see `core/words/CLAUDE.md`
 */
export const ensureWordBuildable = Effect.fnUntraced(function* (snapshot: {
  word: Option.Option<WordRow>
  stages: readonly AsyncWordJobRow[]
}) {
  if (Option.isSome(snapshot.word)) return yield* Effect.fail(new WordAlreadyReadyError())

  const failed = snapshot.stages.some(isTerminallyFailed)
  if (snapshot.stages.length > 0 && !failed)
    return yield* Effect.fail(new WordBuildInProgressError())
  // absent | terminally-failed → buildable
})
