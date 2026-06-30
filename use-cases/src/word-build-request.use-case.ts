import { readWordBuildSnapshot, WordBuildMessageFromJson } from '@lexiai/core-async-word-jobs'
import { ensureWordBuildable, type InvalidWordInputError, parseWordInput } from '@lexiai/core-words'
import { type Language, WORD_JOB_STAGES } from '@lexiai/database'
import { JobsQueue } from '@lexiai/queue'
import { stagePatch, upsertWordJobStages } from '@lexiai/repositories-async-word-jobs'
import { Effect, Schema } from 'effect'

/**
 * The single, restricted creation path behind `POST .../build`: normalize the raw query
 * ({@link parseWordInput} — a phrase ⇒ its first word, empty / symbol-only ⇒
 * {@link InvalidWordInputError}), read the {@link readWordBuildSnapshot current snapshot}, ask
 * {@link ensureWordBuildable} whether that word may be built, then perform the build **action** — seed
 * **every** pipeline stage `pending` (a retry reseeds all from scratch — no resume) and enqueue exactly
 * one build message — and return the seeded rows. The view (`running` {@link import('@lexiai/app-api').WordStateView})
 * is assembled by the API handler, not here — the use-case returns domain rows, the edge owns
 * presentation. The three rejections + genuine infrastructure faults (DB / queue) ride the error channel.
 *
 * A **bare function** (not a `Context.Service`): a flow that stitches different operations under one
 * app entry, owning no primitive decision of its own. It composes a pure parse, the snapshot read, the
 * admission guard, a repo write, and a queue trigger; their `DB` / `JobsQueue` requirements ride the
 * `R` channel and the app entrypoint provides them — see "Service vs plain function" in
 * `.claude/rules/effect-conventions.md`.
 *
 * @see `core/async-word-jobs/CLAUDE.md`
 */
export const requestWordBuild = Effect.fnUntraced(function* (language: Language, word: string) {
  const normalizedWord = yield* parseWordInput(word)
  const snapshot = yield* readWordBuildSnapshot(language, normalizedWord)
  yield* ensureWordBuildable(snapshot)

  // A build comprises every WORD_JOB_STAGES pass, seeded `pending` here (not in the repo — see
  // repositories/async-word-jobs/CLAUDE.md). A retry reseeds ALL stages from scratch (no resume): a
  // regeneration re-runs the whole pipeline. `upsertWordJobStages` returns the rows it wrote, so the
  // API collapses the running view directly — no read-back.
  const reseeded = yield* upsertWordJobStages(
    language,
    normalizedWord,
    WORD_JOB_STAGES.map(stagePatch.pending),
  )

  const queue = yield* JobsQueue
  yield* queue.send(Schema.encodeSync(WordBuildMessageFromJson)({ language, word: normalizedWord }))

  return reseeded
})
