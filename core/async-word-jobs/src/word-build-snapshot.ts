import type { Language } from '@lexiai/database'
import { selectWordJobStages } from '@lexiai/repositories-async-word-jobs'
import { selectWord } from '@lexiai/repositories-words'
import { Effect } from 'effect'

/**
 * Read the word's build snapshot — `{ word, stages }`: the ready `WordRow` (via `selectWord`) + its job
 * stage rows. The one imperative read behind both the admission policy and the API view. Pairs `selectWord` +
 * `selectWordJobStages` in parallel; its `DB` requirement rides the `R` channel. The pure consumers
 * (`ensureWordBuildable` in `@lexiai/core-words`, `collapseWordState` at the API edge) take the returned
 * snapshot directly, so the verdict/collapse never touch the database. The fetch lives **here** —
 * querying the job stages is "working with jobs"; the pure word-build decision lives in
 * `@lexiai/core-words`.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export const readWordBuildSnapshot = Effect.fnUntraced(function* (
  language: Language,
  word: string,
) {
  return yield* Effect.all(
    { word: selectWord(language, word), stages: selectWordJobStages({ language, word }) },
    { concurrency: 'unbounded' },
  )
})
