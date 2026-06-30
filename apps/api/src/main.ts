import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { ConfigProviderLive, Port } from '@lexiai/config'
import { DatabaseLive } from '@lexiai/database'
import { TracingLive } from '@lexiai/observability'
import { JobsQueueLive, QueueClientLive } from '@lexiai/queue'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { WordsApi } from './words/words.api'
import { WordsApiLive } from './words/words.handler'

/**
 * What every handler needs, composed once: the two boundary services the handler flows bottom out at
 * — the live SQS `JobsQueue` (`requestWordBuild`'s enqueue, the bound wrapper over `QueueClientLive`)
 * and the live `DB` (every repo call, `yield*`ed by `selectWord` / `selectWordJobStages` /
 * `requestWordBuild`). The repos + use-case flows are now plain functions taking these from the `R`
 * channel, so there are no per-repo or per-use-case layers to wire — just the boundaries. Their
 * residual `ConfigError` closes against `ConfigProviderLive`.
 */
const DomainLive = Layer.mergeAll(JobsQueueLive.pipe(Layer.provide(QueueClientLive)), DatabaseLive)

const ApiLive = HttpApiBuilder.layer(WordsApi).pipe(Layer.provide(WordsApiLive))

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
  Effect.provide(TracingLive('lexiai-api')),
  Effect.provide(ConfigProviderLive),
  BunRuntime.runMain,
)
