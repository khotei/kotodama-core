import { Config } from 'effect'

export { ConfigProviderLive } from './config-provider-live'

export const DatabaseUrl = Config.redacted('DATABASE_URL')
export const ImagesBucket = Config.string('IMAGES_BUCKET')
export const JobsQueueUrl = Config.string('JOBS_QUEUE_URL')
export const OpenaiApiKey = Config.redacted('OPENAI_API_KEY')
/** LocalStack accepts any region; us-east-1 is the conventional default. */
export const AwsRegion = Config.string('AWS_REGION')
/**
 * Override endpoint for AWS SDK clients (SQS/S3). `None` in prod (the SDK resolves the
 * real AWS endpoint); set to LocalStack's `http://localhost:4566` for local dev.
 */
export const AwsEndpoint = Config.string('AWS_ENDPOINT_URL').pipe(Config.option)
export const LogLevel = Config.string('LOG_LEVEL').pipe(Config.withDefault('info'))
/** HTTP port for `apps/api`; defaults to the value the SPA's `VITE_API_BASE_URL` targets. */
export const Port = Config.int('PORT').pipe(Config.withDefault(3000))

export const AppConfig = Config.all({
  databaseUrl: DatabaseUrl,
  imagesBucket: ImagesBucket,
  jobsQueueUrl: JobsQueueUrl,
  openaiApiKey: OpenaiApiKey,
  awsRegion: AwsRegion,
  logLevel: LogLevel,
  port: Port,
})
