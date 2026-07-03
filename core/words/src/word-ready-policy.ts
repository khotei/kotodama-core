import { Effect, Schema } from 'effect'
import type { Word } from './word.schema'
import { decodeReadyWord } from './word.schema'

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
 * decides", like `ensureWordBuildable`), so no second read and no DB in its test. It **decodes the
 * {@link ReadyWord} leaf** rather than checking `status` alone: proving full content, not trusting
 * the union's discriminant, so anything short of a complete ready word is a `WordNotReadyError`.
 * A corrupt `succeeded` row can't reach here — it already died at `findWord`'s decode.
 */
export const ensureReadyWord = (word: Word) =>
  decodeReadyWord(word).pipe(Effect.mapError(() => new WordNotReadyError()))
