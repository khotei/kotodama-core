import { Language } from '@lexiai/database'
import { Schema } from 'effect'

// Lives here, not in @lexiai/queue — the transport stays message-agnostic. Always a settled
// language: "Auto" detection is resolved client-side before any build is requested.
export const WordBuildMessage = Schema.Struct({
  language: Language,
  word: Schema.String,
})
export type WordBuildMessage = typeof WordBuildMessage.Type

export const WordBuildMessageFromJson = Schema.fromJsonString(WordBuildMessage)
