import { Config } from 'effect'

/**
 * Application configuration, sourced from environment variables via Effect's
 * default ConfigProvider (Tech spec §2.5). Secrets are wrapped in `Redacted`
 * so they never appear in logs or `toString`.
 *
 * Yield it inside an Effect: `const cfg = yield* AppConfig`.
 */
export const AppConfig = Config.all({
  databaseUrl: Config.redacted('DATABASE_URL'),
  imagesBucket: Config.string('IMAGES_BUCKET'),
  jobsQueueUrl: Config.string('JOBS_QUEUE_URL'),
  openaiApiKey: Config.redacted('OPENAI_API_KEY'),
  awsRegion: Config.string('AWS_REGION'),
  logLevel: Config.string('LOG_LEVEL').pipe(Config.withDefault('info')),
})
