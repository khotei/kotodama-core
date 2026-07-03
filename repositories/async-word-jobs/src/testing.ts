import type { JobErrorEntity, Language, WordJobStage } from '@lexiai/database'
import { wordJobStage } from '@lexiai/database'
import { Effect } from 'effect'
import { upsertWordJobStages } from './async-word-jobs.repo'
import { stagePatch } from './stage-patch'

export const PENDING_ALL = wordJobStage.enumValues.map(stagePatch.pending)

export const seedPendingPipeline = (language: Language, word: string) =>
  upsertWordJobStages(language, word, PENDING_ALL)

export const seedRunningStage = (language: Language, word: string, stage: WordJobStage) =>
  Effect.gen(function* () {
    yield* upsertWordJobStages(language, word, PENDING_ALL)
    return yield* upsertWordJobStages(language, word, stagePatch.running(stage))
  })

export const seedFailedWord = (
  language: Language,
  word: string,
  stage: WordJobStage,
  error: JobErrorEntity,
) =>
  Effect.gen(function* () {
    yield* upsertWordJobStages(language, word, PENDING_ALL)
    return yield* upsertWordJobStages(language, word, stagePatch.failed(stage, error))
  })
