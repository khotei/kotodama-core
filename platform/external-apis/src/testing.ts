import { Effect, Layer, Option } from 'effect'
import type { WikiSearchHit, WikiSummary } from './wiki.schema'
import { WikiClient } from './wiki.service'

/**
 * Lookups key on the plain word (case-insensitive) and ignore `language`; a word absent from a map
 * is the 404 path (`Option.none` / `[]`). The fake never fails — its purpose is exercising the
 * Option-not-error grounding contract.
 */
export interface WikiFixtures {
  readonly summaries?: Readonly<Record<string, WikiSummary>>
  readonly searches?: Readonly<Record<string, ReadonlyArray<WikiSearchHit>>>
}

/** Mirrors the production client's absence semantics, incl. disambiguation → `Option.none`. */
export const WikiClientTest = (fixtures: WikiFixtures = {}): Layer.Layer<WikiClient> =>
  Layer.succeed(
    WikiClient,
    WikiClient.of({
      summary: (_language, word) => {
        const hit = fixtures.summaries?.[word.toLowerCase()]
        return Effect.succeed(
          hit === undefined || hit.type === 'disambiguation'
            ? Option.none<WikiSummary>()
            : Option.some(hit),
        )
      },
      searchTitle: (_language, word, _limit) =>
        Effect.succeed(fixtures.searches?.[word.toLowerCase()] ?? []),
    }),
  )
