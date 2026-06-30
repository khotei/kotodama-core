import { Effect, Layer, Option } from 'effect'
import type { WikiSearchHit, WikiSummary } from './wiki.schema'
import { WikiClient } from './wiki.service'

/**
 * Per-word canned results for {@link WikiClientTest}, so a downstream suite can drive grounding
 * without a network or a real {@link WikiClient}. Lookups key on the **plain `word`** (case-insensitive)
 * and ignore `language`:
 *
 * - `summaries` — a present {@link WikiSummary} is returned `Option.some`; a word absent from the map
 *   is `Option.none` (the 404 path). To model a disambiguation result, supply a summary with
 *   `type: 'disambiguation'` — the real client maps it to `Option.none`, so the fake mirrors that.
 * - `searches` — the hit array for a word; a word absent from the map yields `[]`.
 *
 * The fake never fails — its whole purpose is to let a downstream suite exercise the Option-not-error
 * grounding contract.
 */
export interface WikiFixtures {
  readonly summaries?: Readonly<Record<string, WikiSummary>>
  readonly searches?: Readonly<Record<string, ReadonlyArray<WikiSearchHit>>>
}

/**
 * A fixture-backed {@link WikiClient} for downstream suites (e.g. the content-engine grounding tests).
 * Mirrors the production client's absence semantics: an unknown word is `Option.none` / `[]`; a
 * `disambiguation` summary collapses to `Option.none`.
 *
 * @example
 * ```ts
 * const layer = WikiClientTest({
 *   summaries: { lacuna: standardSummary, mercury: disambiguationSummary },
 * })
 * ```
 */
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
