import { CreateBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import { Data, Effect } from 'effect'

// Distinct from StorageError: provisioning fails against a bucket name, not an object key.
export class BucketProvisionError extends Data.TaggedError('BucketProvisionError')<{
  readonly name: string
  readonly cause: unknown
}> {}

// S3 reports "the bucket is already there" with two distinct error names depending on ownership.
const ALREADY_EXISTS = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'])

/**
 * Idempotent create-if-absent — an already-present bucket is a no-op success, so the caller never
 * branches on "exists?". The call is deliberately bare: in `us-east-1` sending a
 * `LocationConstraint` raises `InvalidLocationConstraint`.
 */
export const ensureBucket = (
  client: S3Client,
  name: string,
): Effect.Effect<void, BucketProvisionError> =>
  Effect.tryPromise({
    try: () => client.send(new CreateBucketCommand({ Bucket: name })),
    catch: (cause) => new BucketProvisionError({ name, cause }),
  }).pipe(
    Effect.catchIf(
      (error) => error.cause instanceof Error && ALREADY_EXISTS.has(error.cause.name),
      () => Effect.void,
    ),
    Effect.asVoid,
  )
