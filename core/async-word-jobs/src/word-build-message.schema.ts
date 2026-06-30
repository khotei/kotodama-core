import { Language } from '@lexiai/database'
import { Schema } from 'effect'

/**
 * The build-dispatch message — the only state crossing the queue from {@link requestWordBuild} (enqueue)
 * to the worker (consume). It lives here, not in `@lexiai/queue` (which stays message-agnostic so the
 * transport is reusable). Keyed on
 * a concrete `(language, word)` — "Auto" language detection is resolved client-side before any build
 * is requested, so the message always carries a settled language.
 */
export const WordBuildMessage = Schema.Struct({
  language: Language,
  word: Schema.String,
})
export type WordBuildMessage = typeof WordBuildMessage.Type

/**
 * JSON-string codec for {@link WordBuildMessage}: `requestWordBuild` encodes a message to the string
 * body `JobsQueue.send` takes, and the worker decodes a received body back through the same schema —
 * one source for the wire shape on both ends. The worker only builds when a body decodes as this shape.
 */
export const WordBuildMessageFromJson = Schema.fromJsonString(WordBuildMessage)
