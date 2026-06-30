import * as OpenAiClient from '@effect/ai-openai/OpenAiClient'
import * as OpenAiClientGenerated from '@effect/ai-openai/OpenAiClientGenerated'
import { BunHttpClient, BunRuntime } from '@effect/platform-bun'
import { AiServiceLive, AiServiceResilient } from '@lexiai/ai'
import { ConfigProviderLive, OpenaiApiKey, WorkerConcurrency } from '@lexiai/config'
import {
  DEFAULT_BUILD_TIMEOUT,
  IMAGE_RESILIENCE,
  RealContentEngineLive,
  TEXT_RESILIENCE,
  WordGenerationServiceLive,
  WordGenerationServiceTimed,
} from '@lexiai/core-content'
import { DatabaseLive } from '@lexiai/database'
import { WikiClientLive } from '@lexiai/external-apis'
import { TracingLive } from '@lexiai/observability'
import { JobsQueueLive, QueueClientLive } from '@lexiai/queue'
import { ImagesStoreLive, StorageClientLive } from '@lexiai/storage'
import { Effect, Layer } from 'effect'
import { consumeForever } from './consume'
import { BatchConcurrency } from './process-batch'

/**
 * Production {@link AiService}: the {@link AiServiceLive} boundary over the two OpenAI clients
 * (handwritten {@link OpenAiClient.OpenAiClient} + generated {@link OpenAiClientGenerated}), both keyed
 * off `OPENAI_API_KEY` (`@lexiai/config`) on a `fetch`-backed `BunHttpClient`.
 *
 * Decision: the swappable OpenAI clients ride `AiServiceLive`'s `R` channel and are provided **here at
 * the entrypoint** — mirroring how {@link WikiClientLive} gets its `BunHttpClient` — not inside
 * `@lexiai/ai`, so that package owns no config/HTTP and the old `AiServiceDefault` is retired. The
 * residual `ConfigError` (the key resolves at layer build) closes against {@link ConfigProviderLive}.
 *
 * Per-call **resilience** (retry + per-attempt timeout) is the {@link AiServiceResilient} decorator
 * layer over this base, applying the engine's `TEXT_RESILIENCE`/`IMAGE_RESILIENCE` presets — so the
 * content engine makes bare `ai.*` calls and the retry policy is chosen here at wiring, not in core.
 */
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

/**
 * The production `ContentEngine`: {@link RealContentEngineLive} over its three leaves —
 * {@link AiServiceProd} (OpenAI text+image), {@link WikiClientLive} grounded over a `BunHttpClient`,
 * and the bound {@link ImagesStoreLive} over {@link StorageClientLive} (S3 image writes).
 * `AiServiceProd` and `ImagesStoreLive` resolve their config (`OPENAI_API_KEY`, `IMAGES_BUCKET`) off
 * the `ConfigProviderLive` the entrypoint provides — so this layer's residual requirement is
 * `ContentEngine`-with-`ConfigError`, closed to `never` once `ConfigProviderLive` is in scope.
 */
const ContentEngineLive = RealContentEngineLive.pipe(
  Layer.provide(AiServiceProd),
  Layer.provide(WikiClientLive.pipe(Layer.provide(BunHttpClient.layer))),
  Layer.provide(ImagesStoreLive.pipe(Layer.provide(StorageClientLive))),
)

/**
 * The production {@link WordGenerationService}: the recipe-as-service {@link WordGenerationServiceLive}
 * over the real {@link ContentEngineLive}, wrapped in {@link WordGenerationServiceTimed} so the whole
 * generation is capped at {@link DEFAULT_BUILD_TIMEOUT}. The wall-clock budget lives here at wiring (the
 * infra-as-layer seam) — `createWord`/`buildWord` stay pure and never see it. `ContentEngine` is now an
 * **internal** dependency of this layer, no longer a top-level worker service.
 */
const GenerationLive = WordGenerationServiceTimed(DEFAULT_BUILD_TIMEOUT).pipe(
  Layer.provide(WordGenerationServiceLive.pipe(Layer.provide(ContentEngineLive))),
)

/**
 * The consume loop's dependencies, composed once: the three boundary services `consumeForever` bottoms
 * out at — the live SQS `JobsQueue` it polls (the bound wrapper over `QueueClientLive`), plus
 * `buildWord`'s `WordGenerationService` (the timed {@link GenerationLive}, which hides the engine + the
 * budget) and the live `DB` (every repo / assembler call rides it). `buildWord` is now a plain function
 * taking these from the `R` channel, so there is no use-case or per-repo layer to wire. Their residual
 * `ConfigError` closes against the entrypoint's `ConfigProviderLive`.
 */
const WorkerLive = Layer.mergeAll(
  JobsQueueLive.pipe(Layer.provide(QueueClientLive)),
  GenerationLive,
  DatabaseLive,
)

const program = Effect.gen(function* () {
  yield* Effect.log('worker consuming build messages…')
  yield* consumeForever
}).pipe(Effect.provide(WorkerLive))

program.pipe(
  // Override the BatchConcurrency reference's default from `WORKER_CONCURRENCY` (resolved off the
  // `ConfigProviderLive` provided below), so build fan-out is tunable per environment without a redeploy.
  Effect.provide(Layer.effect(BatchConcurrency, WorkerConcurrency)),
  Effect.provide(TracingLive('lexiai-worker')),
  Effect.provide(ConfigProviderLive),
  BunRuntime.runMain,
)
