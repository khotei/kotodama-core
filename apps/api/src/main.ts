import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { ConfigProviderLive, Port } from '@lexiai/config'
import { WordBuildRequesterLive, WordBuildStateLive } from '@lexiai/core-async-word-jobs'
import { WordFinderLive } from '@lexiai/core-words'
import { DatabaseLive } from '@lexiai/database'

import { TracingLive } from '@lexiai/observability'
import { QueueServiceLive } from '@lexiai/queue'
import { AsyncWordJobsRepoLive } from '@lexiai/repositories-async-word-jobs'
import { WordsRepoLive } from '@lexiai/repositories-words'
import { Effect, Layer } from 'effect'
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'
import { WordsApi } from './words/words.api'
import { WordsApiLive } from './words/words.handler'

/**
 * The three handler-facing use cases, composed once and shared by every handler:
 * `WordBuildRequester` ← `WordBuildState` ← `WordFinder`, all over the two repos + the live SQS
 * `QueueService`, ← the live `DB`. Each `provideMerge` keeps the inner service in the output, so all of
 * `WordFinder` (read), `WordBuildState` (state), and `WordBuildRequester` (build) resolve for their handlers.
 */
const DomainLive = WordBuildRequesterLive.pipe(
  Layer.provideMerge(WordBuildStateLive),
  Layer.provideMerge(WordFinderLive),
  Layer.provide(Layer.mergeAll(WordsRepoLive, AsyncWordJobsRepoLive, QueueServiceLive)),
  Layer.provide(DatabaseLive),
)

const ApiLive = HttpApiBuilder.layer(WordsApi).pipe(Layer.provide(WordsApiLive))

const program = Effect.gen(function* () {
  const port = yield* Port
  // Handler requirements (WordFinder / WordBuildState / WordBuildRequester) surface only after
  // `serve` unwraps the HttpApi's per-handler `Requires` marker, so the domain layer is provided to
  // the served layer, not `ApiLive`.
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
