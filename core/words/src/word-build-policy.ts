import { enumAsyncJobStatus, type WordRow } from '@kotodama/database'
import { Effect, Option, Schema } from 'effect'

// Both 409s are payload-less: the `(language, word)` identity is the request URL.
export class WordAlreadyReadyError extends Schema.TaggedErrorClass<WordAlreadyReadyError>()(
  'WordAlreadyReadyError',
  {},
  { httpApiStatus: 409 },
) {}

export class WordBuildInProgressError extends Schema.TaggedErrorClass<WordBuildInProgressError>()(
  'WordBuildInProgressError',
  {},
  { httpApiStatus: 409 },
) {}

/**
 * The build-admission gate — **the only admission decision** (the write itself is an unguarded
 * upsert, so which states may be (re)seeded is decided here and nowhere else). Pure "caller
 * fetches, gate decides" over one row's status: absent or `failed` ⇒ buildable (a retry is a
 * status flip, not an app lock); `succeeded` / `pending` / `running` ⇒ a typed 409.
 */
export const ensureWordBuildable = Effect.fnUntraced(function* (word: Option.Option<WordRow>) {
  if (Option.isNone(word)) return // absent → buildable

  switch (word.value.status) {
    case enumAsyncJobStatus.succeeded:
      return yield* Effect.fail(new WordAlreadyReadyError())
    case enumAsyncJobStatus.pending:
    case enumAsyncJobStatus.running:
      return yield* Effect.fail(new WordBuildInProgressError())
    case enumAsyncJobStatus.failed:
      return // a retry → buildable
  }
})
