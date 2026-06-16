import { BunRuntime } from '@effect/platform-bun'
import { ConfigProviderLive } from '@lexiai/config'
import { WordBuilderLive } from '@lexiai/core-async-word-jobs'
import { MockContentEngine } from '@lexiai/core-content'
import { DatabaseLive } from '@lexiai/database'
import { TracingLive } from '@lexiai/observability'
import { QueueServiceLive } from '@lexiai/queue'
import { AsyncWordJobsRepoLive } from '@lexiai/repositories-async-word-jobs'
import { WordsRepoLive } from '@lexiai/repositories-words'
import { Effect, Layer } from 'effect'
import { consumeForever } from './consume'

/**
 * The consume loop's dependencies, composed once: `WordBuilder` ← the `MockContentEngine` (the swap
 * boundary — the real OpenAI engine is a layer change here next milestone) + the two repos, alongside
 * the live SQS `QueueService`, all ← the live `DB`. `provideMerge(QueueServiceLive)` keeps the queue in
 * the output so the loop can poll it (WordBuilder itself never touches the queue).
 */
const WorkerLive = WordBuilderLive.pipe(
  Layer.provideMerge(QueueServiceLive),
  Layer.provide(Layer.mergeAll(WordsRepoLive, AsyncWordJobsRepoLive, MockContentEngine)),
  Layer.provide(DatabaseLive),
)

const program = Effect.gen(function* () {
  yield* Effect.log('worker consuming build messages…')
  yield* consumeForever
}).pipe(Effect.provide(WorkerLive))

program.pipe(
  Effect.provide(TracingLive('lexiai-worker')),
  Effect.provide(ConfigProviderLive),
  BunRuntime.runMain,
)
