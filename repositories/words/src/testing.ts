import type { Language, WordInsert } from '@lexiai/database'
import { enumAsyncJobStatus } from '@lexiai/database'
import { makeWordInsert } from '@lexiai/database/factories'
import { upsertWord } from './words.repo'

/** A non-`succeeded` `status` — the states an unready `words` row can carry (content NULL). */
type UnreadyStatus = 'pending' | 'running' | 'failed'

/** Seed a ready (`succeeded`, full-content) row via the real write path. */
export const seedReadyWord = (
  language: Language,
  word: string,
  overrides: Partial<WordInsert> = {},
) => upsertWord(language, word, makeWordInsert({ word, language, ...overrides }))

/**
 * Seed a content-NULL building row — what makes a building word appear in list/counts (they read
 * the `words` table directly); legal because the CHECK only requires content when `succeeded`.
 */
export const seedUnreadyWord = (
  language: Language,
  word: string,
  status: UnreadyStatus = enumAsyncJobStatus.pending,
) => upsertWord(language, word, { status })
