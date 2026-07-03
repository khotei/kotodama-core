import { WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import { ensureWordBuildable, verifyWordInput } from '@lexiai/core-words'
import { DB, enumAsyncJobStatus, type Language, WORD_JOB_STAGES } from '@lexiai/database'
import { JobsQueue } from '@lexiai/queue'
import { stagePatch, upsertWordJobStages } from '@lexiai/repositories-async-word-jobs'
import { selectWord, upsertWord } from '@lexiai/repositories-words'
import { Effect, Schema } from 'effect'

/**
 * The single creation path behind `POST .../build`: verify the raw query ({@link verifyWordInput}
 * — the gibberish gate, so no job is ever seeded for a non-plausible input), ask
 * {@link ensureWordBuildable}, seed atomically, enqueue exactly one build. Returns the seeded stage
 * rows (no read-back) — the running view is the API edge's presentation, not this tier's.
 */
export const requestWordBuild = Effect.fnUntraced(function* (language: Language, word: string) {
  const normalizedWord = yield* verifyWordInput(word)
  yield* ensureWordBuildable(yield* selectWord(language, normalizedWord))

  // ONE transaction: the seeded `pending` row IS the list entry, so it must land atomically with
  // its stages (a failed stage write rolls the seed back). The repos join the tx via the shared
  // `DB` connection — `tx` is never threaded into their signatures. A retry reseeds ALL stages
  // from scratch (no resume).
  const db = yield* DB
  const reseeded = yield* db.transaction(() =>
    Effect.gen(function* () {
      // The upsert is unguarded by design — admission is solely `ensureWordBuildable`'s call above.
      yield* upsertWord(language, normalizedWord, { status: enumAsyncJobStatus.pending })
      return yield* upsertWordJobStages(
        language,
        normalizedWord,
        WORD_JOB_STAGES.map(stagePatch.pending),
      )
    }),
  )

  // Enqueue strictly AFTER the commit — a queue send can't be rolled back, so it must never fire
  // for a transaction that then aborted.
  const queue = yield* JobsQueue
  yield* queue.send(Schema.encodeSync(WordBuildMessageFromJson)({ language, word: normalizedWord }))

  return reseeded
})
