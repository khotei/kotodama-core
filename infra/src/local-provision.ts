import { S3Client } from '@aws-sdk/client-s3'
import { SQSClient } from '@aws-sdk/client-sqs'
import { BunRuntime } from '@effect/platform-bun'
import {
  AwsClientConfig,
  awsResourceList,
  awsResources,
  ConfigProviderLive,
  JobsQueueUrl,
} from '@lexiai/config'
import { ensureQueue } from '@lexiai/queue'
import { ensureBucket } from '@lexiai/storage/provisioning'
import { Effect } from 'effect'

/**
 * The dev provisioning command: idempotently ensure every entry in the {@link awsResources} inventory
 * against the *already-running* LocalStack (it assumes `local:up` — it starts no containers), then
 * exit 0. This is the dev-only `ensure*` caller: the prod `*Live` layers only ever consume by
 * URL/name and create nothing, so running this twice creates-then-no-ops without touching that path.
 *
 * Both clients are built from the resolved {@link AwsClientConfig} — the same flattened
 * region/endpoint/credentials bundle `QueueClientLive`/`StorageClientLive` consume — so they hit
 * LocalStack via `AWS_ENDPOINT_URL`. S3 additionally needs `forcePathStyle` (LocalStack serves buckets
 * as path segments, not virtual-host subdomains). Each client is `acquireRelease`d so both are
 * `destroy()`ed when the program ends, success or failure.
 *
 * The `switch` on `kind` is exhaustive (the `never` default): a new {@link awsResources} entry kind
 * fails `tsc` here until it is dispatched, so the inventory and this provisioner can't silently drift.
 */
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
