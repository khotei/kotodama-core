import { Context, Data, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { type WikiSearchHit, WikiSearchResult, WikiSummary } from './wiki.schema'

/**
 * The single failure of {@link WikiClient}. Reserved for what the engine genuinely *cannot* ground
 * around — a transport fault (network/DNS) or a schema-decode break — with the original wrapped in
 * `cause`. Crucially it is **not** raised for absence: a 404, a missing page, or a disambiguation
 * page is `Option.none` / `[]`, so Wikipedia grounding stays off the engine's error path.
 */
export class WikiError extends Data.TaggedError('WikiError')<{
  readonly method: 'summary' | 'searchTitle'
  readonly cause: unknown
}> {}

/**
 * Best-effort Wikipedia/Wiktionary grounding for the word engine. Two reads, both keyed on a plain
 * language code (e.g. `"en"`):
 *
 * - `summary` — the Wikipedia REST page summary. **Absence is `Option.none`, never {@link WikiError}**:
 *   a 404 (no such page) or a `type: "disambiguation"` payload both yield `Option.none`. Only a
 *   transport fault or a malformed body fails.
 * - `searchTitle` — the MediaWiki Core REST title search; returns the hit array, `[]` when empty.
 *
 * This Option-not-error contract is the point: it keeps grounding from ever putting the engine into
 * a failure state just because Wikipedia has nothing to say about a word.
 *
 * @example
 * ```ts
 * const wiki = yield* WikiClient
 * const summary = yield* wiki.summary('en', 'lacuna') // Option<WikiSummary>
 * const hits = yield* wiki.searchTitle('en', 'lacuna', 5) // ReadonlyArray<WikiSearchHit>
 * ```
 */
export class WikiClient extends Context.Service<
  WikiClient,
  {
    readonly summary: (
      language: string,
      word: string,
    ) => Effect.Effect<Option.Option<WikiSummary>, WikiError>
    readonly searchTitle: (
      language: string,
      word: string,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<WikiSearchHit>, WikiError>
  }
>()('@lexiai/external-apis/WikiClient') {}

// `schemaJson` decodes the whole `{ status, headers, body }` envelope, so the body schema is wrapped
// under `body`; excess envelope keys are ignored by Schema's default decode.
const decodeSummary = HttpClientResponse.schemaJson(Schema.Struct({ body: WikiSummary }))
const decodeSearch = HttpClientResponse.schemaJson(Schema.Struct({ body: WikiSearchResult }))

/**
 * Builds {@link WikiClient} over the {@link HttpClient.HttpClient} in context — the transport seam.
 * The app provides a real client (`BunHttpClient.layer`); tests provide a fake-fetch one. Keeping the
 * transport in `R` means this leaf package depends on no concrete platform client.
 *
 * `HttpClient.get` already returns a *successful* Effect for non-2xx statuses, so 404 is read off
 * `response.status` rather than caught — that's what lets absence land on the value channel.
 */
export const WikiClientLive: Layer.Layer<WikiClient, never, HttpClient.HttpClient> = Layer.effect(
  WikiClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const summary = Effect.fnUntraced(
      function* (language: string, word: string) {
        const response = yield* client.get(
          `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
        )
        if (response.status === 404) return Option.none<WikiSummary>()
        const { body } = yield* decodeSummary(response)
        return body.type === 'disambiguation' ? Option.none<WikiSummary>() : Option.some(body)
      },
      Effect.mapError((cause) => new WikiError({ method: 'summary', cause })),
    )

    const searchTitle = (language: string, word: string, limit: number) =>
      client
        .get(
          `https://${language}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(word)}&limit=${limit}`,
        )
        .pipe(
          Effect.flatMap(decodeSearch),
          Effect.map(({ body }) => body.pages),
          Effect.mapError((cause) => new WikiError({ method: 'searchTitle', cause })),
        )

    return WikiClient.of({ summary, searchTitle })
  }),
)
