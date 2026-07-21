import { WordGenerationService } from '@kotodama/core/content'
import { enumAsyncJobStatus, type Language, WordEntityInsert } from '@kotodama/core/database'
import { upsertWord } from '@kotodama/core/repositories'
import { Effect, Schema } from 'effect'
import { stagesAll } from './build-stages'

const decodeWordInsert = Schema.decodeUnknownEffect(WordEntityInsert)

/**
 * Create a word end to end: generate, then commit. Owns one piece of knowledge — the
 * ready-invariant: a row reaches `succeeded` only together with full content. Deliberately no
 * retry or wall-clock budget here — both are decorator layers at the worker entrypoint, and the
 * timeout bounds generation only (which commits nothing), so a budget overrun can never strand a
 * committed word.
 */
export const createWord = Effect.fnUntraced(function* (language: Language, word: string) {
  const generator = yield* WordGenerationService
  const { content, sourceVersions } = yield* generator.generate(language, word)

  // Uninterruptible so an ambient interrupt (worker shutdown) can't split the `words` write from
  // the caller's stage journal.
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      // With `status` stated, the decode asserts the full ready shape — a malformed assembly dies
      // here, not at the DB CHECK; the upsert then writes content + `succeeded` together.
      const insert = yield* decodeWordInsert({
        ...content,
        word,
        language,
        sourceVersions,
        status: enumAsyncJobStatus.succeeded,
        // Content + `succeeded` + all-succeeded stages land in one write — no separate journal.
        stages: stagesAll(enumAsyncJobStatus.succeeded),
      }).pipe(Effect.orDie)
      return yield* upsertWord(language, word, insert)
    }),
  )
})
