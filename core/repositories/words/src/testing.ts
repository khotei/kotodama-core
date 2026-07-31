import type { Language, WordBuildStagesEntity, WordInsert } from '@kotodama/database'
import { enumAsyncJobStatus } from '@kotodama/database'
import { makeWordInsert } from '@kotodama/database/factories'
import { Effect, Option } from 'effect'
import { selectWord, upsertWord } from './words.repo'

/** A non-`succeeded` `status` — the states an unready `words` row can carry (content NULL). */
type UnreadyStatus = 'pending' | 'running' | 'failed'

/** Seed a ready (`succeeded`, full-content) row via the real write path. */
export function seedReadyWord(
  language: Language,
  word: string,
  overrides: Partial<WordInsert> = {},
) {
  return upsertWord(language, word, makeWordInsert({ word, language, ...overrides }))
}

/**
 * Seed a content-NULL building row — what makes a building word appear in list/counts (they read
 * the `words` table directly); legal because the CHECK only requires content when `succeeded`. Pass
 * `stages` to model a specific stepper (default `[]` — the column's own default).
 */
export function seedUnreadyWord(
  language: Language,
  word: string,
  status: UnreadyStatus = enumAsyncJobStatus.pending,
  stages: WordBuildStagesEntity = [],
) {
  return upsertWord(language, word, { status, stages })
}

/**
 * Read a word's build stages off its `words` row — they ride the `words.stages` jsonb column, not a
 * separate table, so an absent word yields no stages.
 */
export function readStages(language: Language, word: string) {
  return selectWord(language, word).pipe(
    Effect.map(
      Option.match({
        onNone: (): WordBuildStagesEntity => [],
        onSome: (wordRow) => wordRow.stages,
      }),
    ),
  )
}
