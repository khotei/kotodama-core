import { faker } from '@faker-js/faker'
import type { AsyncWordJobInsert } from '../../schema/async-word-jobs/async-word-jobs.table'
import {
  enumAsyncJobStatus,
  enumWordJobStage,
} from '../../schema/async-word-jobs/async-word-jobs.values'
import { enumLanguage } from '../../schema/language'

/**
 * One `async_word_jobs` stage row, seeded `pending`. Pass `{ stage }` to pick the stage and
 * `{ status, result, error }` to model a partway-through run.
 */
export const makeAsyncWordJobInsert = (
  overrides: Partial<AsyncWordJobInsert> = {},
): AsyncWordJobInsert => ({
  word: faker.lorem.word(),
  language: enumLanguage.en,
  stage: enumWordJobStage.fetch_source,
  status: enumAsyncJobStatus.pending,
  ...overrides,
})
