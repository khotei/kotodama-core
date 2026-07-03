import type { AsyncJobStatus, Language } from '@lexiai/database'
import { Effect } from 'effect'
import { HttpApiClient } from 'effect/unstable/httpapi'
import type { WordStateView, WordStatus } from '../src/words/word-state.view'
import { WORD_SEARCH_DEFAULT_LIMIT, WordsApi } from '../src/words/words.api'

/**
 * Assert a {@link WordStateView} is the `status` variant, narrowing it for the rest of the test —
 * replaces the per-test `if (state.status !== 'X') throw …`. Throws on a mismatch or on
 * `null`/`undefined` (the absent state), so the body can read the variant's fields without a guard.
 */
export function assertStatus<S extends WordStatus>(
  state: WordStateView | null | undefined,
  status: S,
): asserts state is Extract<WordStateView, { status: S }> {
  if (state?.status !== status) {
    throw new Error(`expected status "${status}", got "${state?.status ?? 'null'}"`)
  }
}

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

/**
 * The `search` query envelope — every field optional. `page`/`limit` are self-defaulted by the
 * endpoint's query schema on the wire, but the typed client builds the resolved `Type` where both
 * are required, so this helper fills them to keep call sites that don't page terse.
 */
type SearchQuery = {
  readonly q?: string
  readonly status?: AsyncJobStatus
  readonly page?: number
  readonly limit?: number
}

export const search = (language: Language, query: SearchQuery = {}) =>
  HttpApiClient.make(WordsApi).pipe(
    Effect.flatMap((client) =>
      client.words.search({
        params: { language },
        query: { page: 1, limit: WORD_SEARCH_DEFAULT_LIMIT, ...query },
      }),
    ),
  )

/** The `counts` query envelope — only the count-relevant filters (no pagination). */
type CountsQuery = {
  readonly q?: string
  readonly status?: AsyncJobStatus
}

export const counts = (language: Language, query: CountsQuery = {}) =>
  HttpApiClient.make(WordsApi).pipe(
    Effect.flatMap((client) => client.words.counts({ params: { language }, query })),
  )
