import type { Language, SourceVersions, WordContent } from '@lexiai/database'
import { type Cause, Context, Duration, Effect, Layer } from 'effect'
import { ContentEngine } from './content-engine.service'
import { generateWordContent, type WordGenerationError } from './word-generator'

/**
 * Generate a word's content as a **service** — so the whole-build wall-clock budget can be applied as a
 * decorator {@link WordGenerationServiceTimed} (the infra-as-layer seam), keeping `core/words`'
 * `createWord` pure. `generate` runs the recipe ({@link generateWordContent}) and returns the merged
 * {@link WordContent} **bundled with the engine's `sourceVersions`** — provenance is a property of the
 * generation that just produced the content, so the two travel together and `createWord` reads one
 * service (it no longer reaches into {@link ContentEngine} for provenance).
 *
 * The error channel declares **both** `WordGenerationError` (a pass failed) **and** `Cause.TimeoutError`
 * (the budget elapsed) for *every* layer — the type is fixed across the tag, even though
 * {@link WordGenerationServiceLive} never produces a `TimeoutError` (only the `…Timed` decorator does).
 * `buildWord` (`@lexiai/use-cases`) catches both: `WordGenerationError` → per-stage `failed`,
 * `TimeoutError` → every stage `timed_out`.
 *
 * @see `core/content/CLAUDE.md`
 */
export class WordGenerationService extends Context.Service<
  WordGenerationService,
  {
    readonly generate: (
      language: Language,
      word: string,
    ) => Effect.Effect<
      { readonly content: WordContent; readonly sourceVersions: SourceVersions },
      WordGenerationError | Cause.TimeoutError
    >
  }
>()('@lexiai/core-content/WordGenerationService') {}

/**
 * The recipe as a service, over the {@link ContentEngine} swap boundary (captured at layer build). Runs
 * {@link generateWordContent} and bundles the engine's `sourceVersions` onto the result. **No timeout
 * here** — the budget is the {@link WordGenerationServiceTimed} decorator's job; provide this layer
 * directly (no decorator) to generate without a wall-clock cap (a CLI/probe).
 */
export const WordGenerationServiceLive: Layer.Layer<WordGenerationService, never, ContentEngine> =
  Layer.effect(
    WordGenerationService,
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const generate = (language: Language, word: string) =>
        generateWordContent(language, word).pipe(
          Effect.provideService(ContentEngine, engine),
          Effect.map((content) => ({ content, sourceVersions: engine.sourceVersions })),
        )
      return WordGenerationService.of({ generate })
    }),
  )

/**
 * Cap the whole generation at `budget` — a single-tag decorator over {@link WordGenerationService}
 * (the base supplied via `Layer.provide(WordGenerationServiceLive)`), wrapping `generate` in
 * `Effect.timeout(budget)`. The timeout bounds the **generation** only; `createWord` commits *after*
 * `generate` returns, outside this race, so the budget can never strand a committed word (the straddle
 * is closed by scope — the race is resolved before the commit begins). A budget overrun raises
 * `Cause.TimeoutError`, which `buildWord` records as every stage `timed_out`.
 *
 * @example
 * ```ts
 * WordGenerationServiceTimed(DEFAULT_BUILD_TIMEOUT).pipe(Layer.provide(WordGenerationServiceLive))
 * ```
 */
export const WordGenerationServiceTimed = (
  budget: Duration.Duration,
): Layer.Layer<WordGenerationService, never, WordGenerationService> =>
  Layer.effect(
    WordGenerationService,
    Effect.gen(function* () {
      const base = yield* WordGenerationService
      const generate = (language: Language, word: string) =>
        base.generate(language, word).pipe(Effect.timeout(budget))
      return WordGenerationService.of({ generate })
    }),
  )

/**
 * The default whole-build generation budget — the slow part is every LLM text + image call; 5m
 * comfortably covers the real engine's concurrent image generation. The worker entrypoint passes it to
 * {@link WordGenerationServiceTimed}; tests pass a tiny budget to exercise the timeout fast. (Replaces
 * the retired `WordBuildTimeout` `Context.Reference` — the budget is now an explicit layer argument at
 * every wiring site, with no silent default.)
 */
export const DEFAULT_BUILD_TIMEOUT: Duration.Duration = Duration.minutes(5)
