import type { BuildProvenanceEntity, Language } from '@kotodama/database'
import { type Cause, Context, Duration, Effect, Layer } from 'effect'
import { ContentEngine } from './content-engine.service'
import type { WordContent } from './word-content.schema'
import { generateWordContent, type WordGenerationError } from './word-generator'

export const DEFAULT_BUILD_TIMEOUT: Duration.Duration = Duration.minutes(5)

/**
 * A service only so the whole-build budget can be a decorator layer instead of a `createWord`
 * parameter; `generate` bundles the engine's `provenance` so provenance travels with the
 * generation that produced it. The error union is fixed at the tag — the Live layer never raises
 * `TimeoutError` (only the `withBuildBudget` decorator does), but callers must catch both.
 */
export class WordGenerationService extends Context.Service<
  WordGenerationService,
  {
    readonly generate: (
      language: Language,
      word: string,
    ) => Effect.Effect<
      { readonly content: WordContent; readonly provenance: BuildProvenanceEntity },
      WordGenerationError | Cause.TimeoutError
    >
  }
>()('@kotodama/core/content/WordGenerationService') {}

export const WordGenerationServiceLive: Layer.Layer<WordGenerationService, never, ContentEngine> =
  Layer.effect(
    WordGenerationService,
    Effect.gen(function* () {
      const engine = yield* ContentEngine
      const generate = (language: Language, word: string) =>
        generateWordContent(language, word).pipe(
          Effect.provideService(ContentEngine, engine),
          Effect.map((content) => ({ content, provenance: engine.provenance })),
        )
      return WordGenerationService.of({ generate })
    }),
  )

/**
 * Cap the whole generation at `budget` — a single-tag decorator over the base. The timeout bounds
 * generation only: `createWord` commits after `generate` returns, outside this race, so the budget
 * can never strand a committed word.
 */
export const withBuildBudget = (
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
