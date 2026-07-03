import { enumAsyncJobStatus } from '@lexiai/database'
import { Effect, Schema } from 'effect'
import type { ReadyWord, Word } from './word.schema'

/**
 * Exists-but-building is a 409, NOT a 404 (404 would read as non-existence while the word exists).
 * Absence never reaches this error — the caller settles it first (200 `null`). Payload-less: the
 * identity is the request URL.
 */
export class WordNotReadyError extends Schema.TaggedErrorClass<WordNotReadyError>()(
  'WordNotReadyError',
  {},
  { httpApiStatus: 409 },
) {}

/**
 * The read-side ready-gate — pure over an already-decoded {@link Word} ("caller fetches, gate
 * decides", like `ensureWordBuildable`), so no second read and no DB in its test. The status check
 * narrows the union natively; the union already enforced content-completeness at decode.
 */
export const ensureReadyWord = (word: Word): Effect.Effect<ReadyWord, WordNotReadyError> =>
  word.status === enumAsyncJobStatus.succeeded
    ? Effect.succeed(word)
    : Effect.fail(new WordNotReadyError())
