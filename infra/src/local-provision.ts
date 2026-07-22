import { S3Client } from '@aws-sdk/client-s3'
import { SQSClient } from '@aws-sdk/client-sqs'
import { BunRuntime } from '@effect/platform-bun'
import {
  AwsClientConfig,
  awsResourceList,
  awsResources,
  ConfigProviderLive,
  JobsQueueUrl,
} from '@kotodama/platform/config'
import { ensureQueue } from '@kotodama/platform/queue'
import { ensureBucket } from '@kotodama/platform/storage/provisioning'
import { Effect } from 'effect'

// The dev-only `ensure*` caller (prod layers only consume by URL/name and create nothing).
// Assumes `local:up`. S3 needs `forcePathStyle` — LocalStack serves buckets as path segments. The
// `switch` is exhaustive: a new inventory kind fails tsc here until dispatched.
const program = Effect.gen(function* () {
  const aws = yield* AwsClientConfig

  const sqs = yield* Effect.acquireRelease(
    Effect.sync(() => new SQSClient(aws)),
    (client) => Effect.sync(() => client.destroy()),
  )
  const s3 = yield* Effect.acquireRelease(
    Effect.sync(() => new S3Client({ ...aws, forcePathStyle: true })),
    (client) => Effect.sync(() => client.destroy()),
  )

  // Dev drift-guard (cheap, serves the feature's zero-drift goal): the consume-side `JOBS_QUEUE_URL`
  // env leaf must equal the inventory's sqs name — if someone renames the queue in the inventory but
  // not in `.env`, `local:provision` would create one queue while the app reads another. Fail loudly.
  const jobsQueueUrl = yield* JobsQueueUrl
  const sqsName = awsResources.jobsQueue.name
  const urlLeaf = jobsQueueUrl.split('/').at(-1)
  if (urlLeaf !== sqsName) {
    return yield* Effect.die(
      `JOBS_QUEUE_URL leaf "${urlLeaf}" ≠ inventory sqs name "${sqsName}" — env and the AWS-resource inventory disagree`,
    )
  }

  for (const resource of awsResourceList) {
    switch (resource.kind) {
      case 'sqs': {
        const url = yield* ensureQueue(sqs, resource.name)
        yield* Effect.log(`ensured sqs queue ${resource.name} → ${url}`)
        break
      }
      case 's3': {
        yield* ensureBucket(s3, resource.name)
        yield* Effect.log(`ensured s3 bucket ${resource.name}`)
        break
      }
      default: {
        const _exhaustive: never = resource
        return yield* Effect.die(`unhandled AWS resource kind: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }
})

program.pipe(Effect.scoped, Effect.provide(ConfigProviderLive), BunRuntime.runMain)
