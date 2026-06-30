import {
  InvalidWordInputError,
  Language,
  WordAlreadyReadyError,
  WordBuildInProgressError,
} from '@lexiai/core-words'
import { WordEntity } from '@lexiai/database'
import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi'
import { WordStateView } from './word-state.view'

/**
 * The word read — a pure content read keyed on a concrete `(language, word)`. Returns the rendered
 * {@link WordEntity} row when the word is Ready, else `null` (absence is a value, not a 4xx — it
 * mirrors `selectWord`). The build lifecycle is a separate concern read via {@link getWordState}. "Auto"
 * language detection is client-side and never reaches this contract; an out-of-set `:language` is a
 * decode-level 4xx, not a handler concern.
 */
const getWord = HttpApiEndpoint.get('getWord', '/words/:language/:word', {
  params: { language: Language, word: Schema.String },
  success: Schema.NullOr(WordEntity),
})

/**
 * The build-state read — the `(word, language)`'s {@link WordStateView} (`succeeded` / `running` /
 * `failed`), or `null` when nothing has been requested (no word, no stages — mirrors {@link getWord}).
 * Issued by the word page while a word is being built to drive the progress stepper; the rendered
 * content itself comes from {@link getWord}.
 */
const getWordState = HttpApiEndpoint.get('getWordState', '/words/:language/:word/state', {
  params: { language: Language, word: Schema.String },
  success: Schema.NullOr(WordStateView),
})

/**
 * The explicit creation endpoint — issued by the word page only when it reads a word absent (`null`);
 * a retry against a `failed` word reuses it. Success is the freshly-seeded `running`
 * {@link WordStateView} (the just-created resource). Every other state is a typed HTTP error:
 * {@link WordBuildInProgressError} (409 — already running), {@link WordAlreadyReadyError} (409 — already
 * Ready), {@link InvalidWordInputError} (422 — not a buildable word). No request body: the identity is the path.
 */
const buildWord = HttpApiEndpoint.post('buildWord', '/words/:language/:word/build', {
  params: { language: Language, word: Schema.String },
  success: WordStateView,
  error: Schema.Union([WordAlreadyReadyError, WordBuildInProgressError, InvalidWordInputError]),
})

export const wordsGroup = HttpApiGroup.make('words').add(getWord).add(getWordState).add(buildWord)

/**
 * The LexiAI HTTP contract, consumed by both `apps/api` (server) and `apps/web` (typed client).
 *
 * **Path convention (settled here for the whole API):** every route is mounted under `/api`, so the
 * read is `GET /api/words/:language/:word`, the build state is `GET /api/words/:language/:word/state`,
 * and the create is `POST /api/words/:language/:word/build`.
 */
export const WordsApi = HttpApi.make('lexiai').add(wordsGroup).prefix('/api')
