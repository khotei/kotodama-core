import { Config, Option, Redacted } from 'effect'

export { type AwsResource, awsResourceList, awsResources } from './aws-resources'
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
// AWS credentials. The key id + secret are **required**: every target we run against (prod Lambda's
// execution role, the LocalStack harnesses, local dev) always has them, so a missing one is a
// misconfiguration we want to fail on at config resolution (app start), not at the first SQS/S3 call.
// The session token is genuinely optional — the Lambda role sets it, LocalStack/dev (static creds) do
// not. They are config (not a client's implicit ambient resolution) so a test harness can point any
// client at LocalStack through the same `ConfigProvider` seam as the endpoint — `Bun.S3Client` in
// particular snapshots ambient creds at process start and ignores runtime injection.
const AwsAccessKeyId = Config.string('AWS_ACCESS_KEY_ID')
const AwsSecretAccessKey = Config.redacted('AWS_SECRET_ACCESS_KEY')
const AwsSessionToken = Config.redacted('AWS_SESSION_TOKEN').pipe(Config.option)

/** Connection options shared by every AWS SDK client — the resolved shape both SQS and S3 consume. */
export interface AwsClientConfig {
  readonly region: string
  readonly endpoint?: string
  readonly credentials: {
    readonly accessKeyId: string
    readonly secretAccessKey: string
    readonly sessionToken?: string
  }
}

/**
 * The single source of AWS client wiring: region + credentials (always) + the optional endpoint,
 * resolved from env via this package and **flattened from `Option` here, once**, so each service
 * constructs its client with no per-service `Option` plumbing — `new SQSClient(yield* AwsClientConfig)`
 * / `Bun.S3Client({ bucket, ...spread })`. The key id + secret are required (missing ⇒ a `ConfigError`
 * at layer build); `sessionToken` rides along when present (the Lambda role sets it). Shape matches the
 * AWS SDK's client config; `Bun.S3Client` takes the same fields flattened.
 */
export const AwsClientConfig: Config.Config<AwsClientConfig> = Config.map(
  Config.all({
    region: AwsRegion,
    endpoint: AwsEndpoint,
    accessKeyId: AwsAccessKeyId,
    secretAccessKey: AwsSecretAccessKey,
    sessionToken: AwsSessionToken,
  }),
  ({ region, endpoint, accessKeyId, secretAccessKey, sessionToken }) => ({
    region,
    ...(Option.isSome(endpoint) ? { endpoint: endpoint.value } : {}),
    credentials: {
      accessKeyId,
      secretAccessKey: Redacted.value(secretAccessKey),
      ...(Option.isSome(sessionToken) ? { sessionToken: Redacted.value(sessionToken.value) } : {}),
    },
  }),
)
export const LogLevel = Config.string('LOG_LEVEL').pipe(Config.withDefault('info'))
/** HTTP port for `apps/api`; defaults to the value the SPA's `VITE_API_BASE_URL` targets. */
export const Port = Config.int('PORT').pipe(Config.withDefault(3000))

/**
 * Worker batch concurrency — how many word builds the consumer runs at once. **Default 1.** At a low
 * OpenAI usage tier the `gpt-image` rate limit (Tier 1 ≈ 5 images/min) means even one word's ~11 image
 * renders nearly fills the per-minute window, so concurrent builds collide on a 429. Keep it 1 until a
 * higher tier lifts the limit, then raise this env var (no redeploy) — see `apps/worker/process-batch.ts`.
 */
export const WorkerConcurrency = Config.int('WORKER_CONCURRENCY').pipe(Config.withDefault(1))

export const AppConfig = Config.all({
  databaseUrl: DatabaseUrl,
  imagesBucket: ImagesBucket,
  jobsQueueUrl: JobsQueueUrl,
  openaiApiKey: OpenaiApiKey,
  awsRegion: AwsRegion,
  logLevel: LogLevel,
  port: Port,
})
