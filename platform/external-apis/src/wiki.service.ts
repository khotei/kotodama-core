import { Context, Data, Effect, Layer, Option, Schema } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/unstable/http'
import { type WikiSearchHit, WikiSearchResult, WikiSummary } from './wiki.schema'

// NOT raised for absence — a 404 or disambiguation page is `Option.none`/`[]`, so grounding
// stays off the engine's error path; only transport/decode faults fail.
export class WikiError extends Data.TaggedError('WikiError')<{
  readonly method: 'summary' | 'searchTitle'
  readonly cause: unknown
}> {}

/**
 * Best-effort Wikipedia grounding. The Option-not-error contract is the point: Wikipedia having
 * nothing to say about a word must never put the engine into a failure state.
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
>()('@kotodama/platform/external-apis/WikiClient') {}

// `schemaJson` decodes the whole `{ status, headers, body }` envelope, so the body schema is wrapped
// under `body`; excess envelope keys are ignored by Schema's default decode.
const decodeSummary = HttpClientResponse.schemaJson(Schema.Struct({ body: WikiSummary }))
const decodeSearch = HttpClientResponse.schemaJson(Schema.Struct({ body: WikiSearchResult }))

// `HttpClient.get` returns a *successful* Effect for non-2xx statuses, so 404 is read off
// `response.status` — that's what lets absence land on the value channel.
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
