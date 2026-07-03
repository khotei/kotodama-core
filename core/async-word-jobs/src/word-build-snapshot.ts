import { findWord } from '@kotodama/core-words'
import type { Language } from '@kotodama/database'
import { selectWordJobStages } from '@kotodama/repositories-async-word-jobs'
import { Effect } from 'effect'

/**
 * Read the word's build snapshot — `{ word, stages }`: the decoded `Option<Word>` (via `findWord`) +
 * its job stage rows, paired in parallel; its `DB` requirement rides the `R` channel. The sole
 * consumer is the API's `getWordState` view, whose pure `collapseWordState` takes this snapshot
 * directly (never touching the database). The fetch lives **here** — querying the job stages is
 * "working with jobs". The admission gate reads the raw row via `selectWord` on its own path, so it
 * does not share this (decoded) snapshot.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export const readWordBuildSnapshot = Effect.fnUntraced(function* (
  language: Language,
  word: string,
) {
  return yield* Effect.all(
    { word: findWord(language, word), stages: selectWordJobStages({ language, word }) },
    { concurrency: 'unbounded' },
  )
})
