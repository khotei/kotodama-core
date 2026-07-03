import {
  InvalidWordInputError,
  Language,
  Word,
  WordAlreadyReadyError,
  WordBuildInProgressError,
  WordNotReadyError,
} from '@lexiai/core-words'
import { AsyncJobStatus, WordEntity } from '@lexiai/database'
import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { Paginated, pageQuery } from '../pagination.view'
import { WordCountsView } from './word-counts.view'
import { WordStateView } from './word-state.view'

// Page-size policy is this edge's, not the repo's (whose `limit` is a bare pass-through): the query
// schema self-defaults an omitted `page`/`limit` and rejects a `limit` past the max as a
// decode-level 4xx, so the handler reads both as required.
export const WORD_SEARCH_DEFAULT_LIMIT = 20
export const WORD_SEARCH_MAX_LIMIT = 100

// Three outcomes: Ready ⇒ the row; absent ⇒ 200 `null` (absence is a value, not a 4xx);
// exists-but-building ⇒ 409 (NOT 404 — the word exists and is building).
const getWord = HttpApiEndpoint.get('getWord', '/words/:language/:word', {
  params: { language: Language, word: Schema.String },
  success: Schema.NullOr(WordEntity),
  error: WordNotReadyError,
})

const getWordState = HttpApiEndpoint.get('getWordState', '/words/:language/:word/state', {
  params: { language: Language, word: Schema.String },
  success: Schema.NullOr(WordStateView),
})

const buildWord = HttpApiEndpoint.post('buildWord', '/words/:language/:word/build', {
  params: { language: Language, word: Schema.String },
  success: WordStateView,
  error: Schema.Union([WordAlreadyReadyError, WordBuildInProgressError, InvalidWordInputError]),
})

// Ordered by recency (`created_at DESC, word ASC`) — numbered-page navigation over `page`/`limit`.
const search = HttpApiEndpoint.get('search', '/words/:language/search', {
  params: { language: Language },
  query: {
    q: Schema.optionalKey(Schema.String),
    status: Schema.optionalKey(AsyncJobStatus),
    ...pageQuery({ defaultLimit: WORD_SEARCH_DEFAULT_LIMIT, maxLimit: WORD_SEARCH_MAX_LIMIT }),
  },
  // Items are the core `Word` union verbatim — a ready item carries full content, a building one
  // just identity + status. Same shape `getWord`/`getWordState` speak; no edge-only summary.
  success: Paginated(Word),
})

// Counts agree with what `search` lists by construction: both read the same `wordSearchFilter`, so
// the per-status tally always equals what the list can page. No pagination params: counts span the
// whole match, not a page.
const counts = HttpApiEndpoint.get('counts', '/words/:language/counts', {
  params: { language: Language },
  query: {
    q: Schema.optionalKey(Schema.String),
    status: Schema.optionalKey(AsyncJobStatus),
  },
  success: WordCountsView,
})

export const wordsGroup = HttpApiGroup.make('words')
  .add(getWord)
  .add(getWordState)
  .add(buildWord)
  .add(search)
  .add(counts)

export const WordsApi = HttpApi.make('lexiai').add(wordsGroup).prefix('/api')
