import { enumAsyncJobStatus, WordEntity } from '@lexiai/database'
import { Schema, Struct } from 'effect'

/**
 * The domain word — a `status`-keyed union decoded directly from the permissive `words` row. It
 * enforces "ready ⇒ complete content" at decode, mirroring the DB CHECK: a `succeeded` row missing
 * content fails {@link ReadyWord}; a building row matches {@link UnreadyWord} and its NULL content
 * drops as excess (Effect v4 strips excess keys on decode). `StaleWord` (content + non-succeeded)
 * is deliberately NOT a leaf — reserved for the parked regen feature.
 */

const identityFields = WordEntity.mapFields(
  Struct.pick(['id', 'word', 'language', 'createdAt', 'updatedAt']),
).fields

// Every WordEntity field with `status` pinned — the entity's content fields are non-null, so this
// leaf IS the ready invariant.
export const ReadyWord = Schema.Struct({
  ...WordEntity.mapFields(Struct.omit(['status'])).fields,
  status: Schema.Literal(enumAsyncJobStatus.succeeded),
})
export type ReadyWord = typeof ReadyWord.Type

export const UnreadyWord = Schema.Struct({
  ...identityFields,
  status: Schema.Literals([
    enumAsyncJobStatus.pending,
    enumAsyncJobStatus.running,
    enumAsyncJobStatus.failed,
  ]),
})
export type UnreadyWord = typeof UnreadyWord.Type

export const Word = Schema.Union([ReadyWord, UnreadyWord])
export type Word = typeof Word.Type

// `decodeUnknownEffect`, not `decodeEffect`: a `WordRow`'s `status` is the plain enum string, not
// statically the union's narrowed `Encoded` type — the union re-narrows it at decode.
export const decodeWord = Schema.decodeUnknownEffect(Word)
