import type { Language, WordInsert } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { Effect } from 'effect'
import { WordsRepo } from './words.repo'

/**
 * Seed a ready `words` row — the `succeeded` ground truth a higher-layer test reads. Returns the
 * saved {@link import('@lexiai/database').WordRow} so the test can assert against generated ids /
 * content; `overrides` extend the faker content (e.g. a fixed `coreDefinition`). Requires
 * {@link WordsRepo} in context.
 */
export const seedReadyWord = (
  language: Language,
  word: string,
  overrides: Partial<WordInsert> = {},
) =>
  Effect.flatMap(WordsRepo, (repo) => repo.save(makeWordInsert({ word, language, ...overrides })))
