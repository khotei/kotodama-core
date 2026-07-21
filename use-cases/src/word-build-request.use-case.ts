import {
  ensureWordBuildable,
  stagesAll,
  verifyWordInput,
  WordBuildMessageFromJson,
} from '@kotodama/core-words'
import { enumAsyncJobStatus, type Language } from '@kotodama/database'
import { JobsQueue } from '@kotodama/queue'
import { selectWord, upsertWord } from '@kotodama/repositories-words'
import { Effect, Schema } from 'effect'

/**
 * The single creation path behind `POST .../build`: verify the raw query ({@link verifyWordInput}
 * — the gibberish gate, so no job is ever seeded for a non-plausible input), ask
 * {@link ensureWordBuildable}, seed, enqueue exactly one build. Returns the seeded row, whose
 * `stages` are the running view — no read-back.
 */
export const requestWordBuild = Effect.fnUntraced(function* (language: Language, word: string) {
  const normalizedWord = yield* verifyWordInput(word)
  yield* ensureWordBuildable(yield* selectWord(language, normalizedWord))

  // The seeded `pending` row IS the list entry, and its stages ride the same row — one write,
  // atomic by construction (no cross-table transaction). The upsert is unguarded by design:
  // admission is solely `ensureWordBuildable` above. A retry reseeds every stage `pending`.
  const seeded = yield* upsertWord(language, normalizedWord, {
    status: enumAsyncJobStatus.pending,
    stages: stagesAll(enumAsyncJobStatus.pending),
  })

  // Enqueue strictly AFTER the write — a queue send can't be rolled back, so it must never fire
  // for a write that then failed.
  const queue = yield* JobsQueue
  yield* queue.send(Schema.encodeSync(WordBuildMessageFromJson)({ language, word: normalizedWord }))

  return seeded
})
