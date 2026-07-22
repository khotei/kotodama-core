import * as OpenAiClient from '@effect/ai-openai/OpenAiClient'
import * as OpenAiClientGenerated from '@effect/ai-openai/OpenAiClientGenerated'
import { BunHttpClient, BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { DatabaseLive } from '@kotodama/database'
import { AiServiceLive } from '@kotodama/platform/ai'
import { ConfigProviderLive, OpenaiApiKey, Port } from '@kotodama/platform/config'
import { TracingLive } from '@kotodama/platform/observability'
import { JobsQueueLive } from '@kotodama/platform/queue'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { KotodamaApi } from './kotodama.api'
import { WordsApiLive } from './words/words.handler'

// Deliberately duplicates the worker's ~10-line AiServiceProd rather than sharing a layer, and
// omits its AiServiceResilient decorator: the verifier's judge is fail-open, so retry buys little
// and would pull image-path tuning into a text-only app.
const AiServiceProd = AiServiceLive.pipe(
  Layer.provide([
    OpenAiClient.layerConfig({ apiKey: OpenaiApiKey }),
    OpenAiClientGenerated.layerConfig({ apiKey: OpenaiApiKey }),
  ]),
  Layer.provide(BunHttpClient.layer),
)

// Only the boundary services — repos and flows are plain functions whose `R` bottoms out here.
const DomainLive = Layer.mergeAll(JobsQueueLive, DatabaseLive, AiServiceProd)

// `openapiPath` makes the builder derive `OpenApi.fromApi(KotodamaApi)` and serve it as a router-level
// GET (not an `HttpApiEndpoint`, so the doc doesn't list its own route). F-PLAT-014 fetches it live
// at codegen time from a configurable base URL.
const ApiLive = HttpApiBuilder.layer(KotodamaApi, { openapiPath: '/api/openapi.json' }).pipe(
  Layer.provide(WordsApiLive),
)

const program = Effect.gen(function* () {
  const port = yield* Port
  // Handler requirements (DB / JobsQueue) surface only after `serve` unwraps the HttpApi's
  // per-handler `Requires` marker, so the domain layer is provided to the served layer, not `ApiLive`.
  yield* Layer.launch(
    HttpRouter.serve(ApiLive).pipe(
      Layer.provide(DomainLive),
      Layer.provideMerge(BunHttpServer.layer({ port })),
    ),
  )
})

program.pipe(
  Effect.provide(TracingLive('kotodama-api')),
  Effect.provide(ConfigProviderLive),
  BunRuntime.runMain,
)
