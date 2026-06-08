import { BunRuntime } from '@effect/platform-bun'
import { AppConfig } from '@lexiai/config'
import { TracingLive } from '@lexiai/observability'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const config = yield* AppConfig
  // databaseUrl + openaiApiKey are Redacted and intentionally not logged.
  yield* Effect.log('api booting…', {
    awsRegion: config.awsRegion,
    imagesBucket: config.imagesBucket,
    jobsQueueUrl: config.jobsQueueUrl,
    logLevel: config.logLevel,
  })
})

program.pipe(Effect.provide(TracingLive('lexiai-api')), BunRuntime.runMain)
