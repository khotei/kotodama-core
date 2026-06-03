import { Config } from 'effect'

export { ConfigProviderLive } from './config-provider-live'

/**
 * Env config (Tech spec §2.5). Each setting is an individual `Config` so a
 * consumer resolves only what it needs — `AppConfig` requires every key, so
 * prefer one export when you need one. Secrets use `Redacted`. Provide
 * `ConfigProviderLive` at the entrypoint to source the repo-root `.env`; see
 * `@.claude/rules/config.md`.
 */
export const DatabaseUrl = Config.redacted('DATABASE_URL')
export const ImagesBucket = Config.string('IMAGES_BUCKET')
export const JobsQueueUrl = Config.string('JOBS_QUEUE_URL')
export const OpenaiApiKey = Config.redacted('OPENAI_API_KEY')
/** LocalStack accepts any region; us-east-1 is the conventional default. */
export const AwsRegion = Config.string('AWS_REGION')
export const LogLevel = Config.string('LOG_LEVEL').pipe(Config.withDefault('info'))

export const AppConfig = Config.all({
  databaseUrl: DatabaseUrl,
  imagesBucket: ImagesBucket,
  jobsQueueUrl: JobsQueueUrl,
  openaiApiKey: OpenaiApiKey,
  awsRegion: AwsRegion,
  logLevel: LogLevel,
})
