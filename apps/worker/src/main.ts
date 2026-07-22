import * as OpenAiClient from '@effect/ai-openai/OpenAiClient'
import * as OpenAiClientGenerated from '@effect/ai-openai/OpenAiClientGenerated'
import { BunHttpClient, BunRuntime } from '@effect/platform-bun'
import {
  DEFAULT_BUILD_TIMEOUT,
  IMAGE_RESILIENCE,
  RealContentEngineLive,
  TEXT_RESILIENCE,
  WordGenerationServiceLive,
  withBuildBudget,
} from '@kotodama/core/content'
import { DatabaseLive } from '@kotodama/core/database'
import { AiServiceLive, AiServiceResilient } from '@kotodama/platform/ai'
import { ConfigProviderLive, OpenaiApiKey, WorkerConcurrency } from '@kotodama/platform/config'
import { WikiClientLive } from '@kotodama/platform/external-apis'
import { TracingLive } from '@kotodama/platform/observability'
import { JobsQueueLive } from '@kotodama/platform/queue'
import { ImagesStoreLive } from '@kotodama/platform/storage'
import { Effect, Layer } from 'effect'
import { consumeForever } from './consume'
import { BatchConcurrency } from './process-batch'

// Per-call retry is the AiServiceResilient decorator applied HERE at wiring — the engine makes
// bare `ai.*` calls. The OpenAI clients are provided at the entrypoint so @kotodama/platform/ai owns no
// config/HTTP.
const AiServiceProd = AiServiceResilient(TEXT_RESILIENCE, IMAGE_RESILIENCE).pipe(
  Layer.provide(
    AiServiceLive.pipe(
      Layer.provide([
        OpenAiClient.layerConfig({ apiKey: OpenaiApiKey }),
        OpenAiClientGenerated.layerConfig({ apiKey: OpenaiApiKey }),
      ]),
      Layer.provide(BunHttpClient.layer),
    ),
  ),
)

const ContentEngineLive = RealContentEngineLive.pipe(
  Layer.provide(AiServiceProd),
  Layer.provide(WikiClientLive.pipe(Layer.provide(BunHttpClient.layer))),
  Layer.provide(ImagesStoreLive),
)

// The whole-build timeout is a decorator chosen here at wiring — createWord/buildWord never see it.
const GenerationLive = withBuildBudget(DEFAULT_BUILD_TIMEOUT).pipe(
  Layer.provide(WordGenerationServiceLive.pipe(Layer.provide(ContentEngineLive))),
)

// Only the boundary services — buildWord is a plain function whose `R` bottoms out here.
const WorkerLive = Layer.mergeAll(JobsQueueLive, GenerationLive, DatabaseLive)

const program = Effect.gen(function* () {
  yield* Effect.log('worker consuming build messages…')
  yield* consumeForever
}).pipe(Effect.provide(WorkerLive))

program.pipe(
  // Build fan-out is tunable per environment via WORKER_CONCURRENCY, no redeploy.
  Effect.provide(Layer.effect(BatchConcurrency, WorkerConcurrency)),
  Effect.provide(TracingLive('kotodama-worker')),
  Effect.provide(ConfigProviderLive),
  BunRuntime.runMain,
)
