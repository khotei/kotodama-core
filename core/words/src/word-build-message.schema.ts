import { Language } from '@kotodama/database'
import { Schema } from 'effect'

// The build-request message the API enqueues and the worker consumes. Not in @kotodama/platform/queue — the
// transport stays message-agnostic. Always a settled language: "Auto" detection is resolved
// client-side before any build is requested.
export const WordBuildMessage = Schema.Struct({
  language: Language,
  word: Schema.String,
})
export type WordBuildMessage = typeof WordBuildMessage.Type

export const WordBuildMessageFromJson = Schema.fromJsonString(WordBuildMessage)
