import { BunRuntime } from '@effect/platform-bun'
import { AppConfig } from '@lexiai/config'
import { TracingLive } from '@lexiai/observability'
import { Effect } from 'effect'

// Deployed to AWS Lambda via the Lambda Web Adapter (no bootstrap script yet —
// that is deployment work): https://github.com/aws/aws-lambda-web-adapter
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

// Provide tracing before running so the OTel tracer is installed for all spans.
program.pipe(Effect.provide(TracingLive('lexiai-api')), BunRuntime.runMain)
