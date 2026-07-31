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
// Key id + secret are required (every target has them — fail at app start, not the first call);
// the session token is genuinely optional (only the Lambda role sets it). Config, not ambient env:
// Bun.S3Client snapshots ambient creds at process start and ignores runtime injection.
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
 * The single source of AWS client wiring, flattened from `Option` here once so each service
 * constructs its client with no per-service Option plumbing. Shape matches the AWS SDK's client
 * config; `Bun.S3Client` takes the same fields flattened.
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
// Observability env, single-sourced here so `platform/observability` reads it through config, not
// `process.env`. NODE_ENV and the OTLP endpoint are required — a deploy that omits either fails fast
// at startup rather than silently mis-tracing (dev-mode exporter, or spans sent nowhere). Version
// stays optional (`None` = off a release).
export const OtelExporterEndpoint = Config.string('OTEL_EXPORTER_OTLP_ENDPOINT')
export const DeployEnv = Config.string('NODE_ENV')
export const ServiceVersion = Config.string('SERVICE_VERSION').pipe(Config.option)

/** HTTP port for `apps/api`; defaults to the value the SPA's `VITE_API_BASE_URL` targets. */
export const Port = Config.int('PORT').pipe(Config.withDefault(3000))

/** Worker build fan-out; the default-1 rationale lives on `BatchConcurrency` (`apps/worker/process-batch.ts`). */
export const WorkerConcurrency = Config.int('WORKER_CONCURRENCY').pipe(Config.withDefault(1))
