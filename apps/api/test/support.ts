import type { Language } from '@lexiai/database'
import { Effect } from 'effect'
import { HttpApiClient } from 'effect/unstable/httpapi'
import { WordsApi } from '../src/words/words.api'

/**
 * Operation wrappers over the typed {@link WordsApi} client: each builds the client bound to the
 * in-memory test server and issues one call, so a test reads `yield* getWord(EN, 'lacuna')` instead
 * of repeating `HttpApiClient.make(WordsApi)` + the params envelope. Require the served `WordsApi`
 * layer in context (provided by the file's `TestLayer`).
 */
export const getWord = (language: Language, word: string) =>
  HttpApiClient.make(WordsApi).pipe(
    Effect.flatMap((client) => client.words.getWord({ params: { language, word } })),
  )

export const getWordState = (language: Language, word: string) =>
  HttpApiClient.make(WordsApi).pipe(
    Effect.flatMap((client) => client.words.getWordState({ params: { language, word } })),
  )

export const buildWord = (language: Language, word: string) =>
  HttpApiClient.make(WordsApi).pipe(
    Effect.flatMap((client) => client.words.buildWord({ params: { language, word } })),
  )
