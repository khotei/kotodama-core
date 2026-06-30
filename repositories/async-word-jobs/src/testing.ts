import type { JobError, Language, WordJobStage } from '@lexiai/database'
import { wordJobStage } from '@lexiai/database'
import { Effect } from 'effect'
import { upsertWordJobStages } from './async-word-jobs.repo'
import { stagePatch } from './stage-patch'

/** Every pipeline stage as a `pending` patch — the seed/reset a build starts from. */
export const PENDING_ALL = wordJobStage.enumValues.map(stagePatch.pending)

/**
 * Seed the full pipeline `pending` — the Being-made ground truth (an active build with no terminal
 * failure). Requires the `DB` service in context (`upsertWordJobStages` `yield*`s it).
 */
export const seedPendingPipeline = (language: Language, word: string) =>
  upsertWordJobStages(language, word, PENDING_ALL)

/**
 * Seed the full pipeline `pending`, then move one `stage` to `running` — a build observably in
 * progress. Requires the `DB` service in context.
 */
export const seedRunningStage = (language: Language, word: string, stage: WordJobStage) =>
  Effect.gen(function* () {
    yield* upsertWordJobStages(language, word, PENDING_ALL)
    return yield* upsertWordJobStages(language, word, stagePatch.running(stage))
  })

/**
 * Drive a word to terminal `failed` at `stage` — the Couldn't-be-made ground truth (seeds the
 * pipeline `pending`, then fails the one stage). Requires the `DB` service in context.
 */
export const seedFailedWord = (
  language: Language,
  word: string,
  stage: WordJobStage,
  error: JobError,
) =>
  Effect.gen(function* () {
    yield* upsertWordJobStages(language, word, PENDING_ALL)
    return yield* upsertWordJobStages(language, word, stagePatch.failed(stage, error))
  })
