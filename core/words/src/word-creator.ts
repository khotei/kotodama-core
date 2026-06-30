import { WordGenerationService } from '@lexiai/core-content'
import { type Language, WordEntityInsert } from '@lexiai/database'
import { upsertWords } from '@lexiai/repositories-words'
import { Effect, Schema } from 'effect'

const decodeWordInsert = Schema.decodeUnknownEffect(WordEntityInsert)

/**
 * Create a word end to end — **generate its content, then commit it**. Generation runs through
 * {@link WordGenerationService} (`@lexiai/core-content`), which returns the merged content bundled with
 * the engine's `sourceVersions`; the promotion — decode through `WordEntityInsert` (a malformed assembly
 * `die`s — impossible state for a conforming producer), stamp the provenance, `upsertWords` — runs in one
 * `Effect.uninterruptible` region so an ambient interrupt (worker shutdown) can never split the `words`
 * write from the caller's stage journal. Returns the committed row.
 *
 * **Pure of infrastructure:** no retry, no wall-clock budget here. The whole-build timeout is a decorator
 * layer ({@link WordGenerationServiceTimed}) configured at the worker entrypoint, so a budget overrun
 * surfaces as `TimeoutError` from `generate` — *before* any commit (the timeout bounds generation only,
 * which commits nothing) — and `buildWord` (`@lexiai/use-cases`) records the outcome. This file owns one
 * piece of knowledge: the **pristine invariant** — a row appears *only* on full content. A plain
 * `Effect.fnUntraced`, not a service: its `WordGenerationService | DB` requirement rides `R`.
 *
 * @see `core/words/CLAUDE.md`
 */
export const createWord = Effect.fnUntraced(function* (language: Language, word: string) {
  const generator = yield* WordGenerationService
  const { content, sourceVersions } = yield* generator.generate(language, word)

  // The budget (if any) is already spent on generation above; commit uninterruptibly so no ambient
  // interrupt can split the `words` write from the caller's stage journal — a committed word is never
  // recorded `timed_out`.
  return yield* Effect.uninterruptible(
    Effect.gen(function* () {
      const insert = yield* decodeWordInsert({ ...content, word, language, sourceVersions }).pipe(
        Effect.orDie,
      )
      return yield* upsertWords(insert)
    }),
  )
})
