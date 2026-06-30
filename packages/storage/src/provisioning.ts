import { CreateBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import { Data, Effect } from 'effect'

/**
 * A bucket could not be provisioned. Distinct from the storage port's key-shaped `StorageError` —
 * provisioning fails against a bucket *name*, not an object key — so the two failures stay separable
 * at a call site. The raw SDK rejection is wrapped in `cause` for diagnostics.
 */
export class BucketProvisionError extends Data.TaggedError('BucketProvisionError')<{
  readonly name: string
  readonly cause: unknown
}> {}

// S3 reports "the bucket is already there" with two distinct error names depending on ownership.
const ALREADY_EXISTS = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'])

/**
 * Idempotently create the S3 bucket `name`, succeeding whether it was just created or already
 * existed — provisioning is a desired-state assertion, not a one-shot create, so the caller never
 * branches on "exists?". An already-present bucket (`BucketAlreadyOwnedByYou` /
 * `BucketAlreadyExists`) is **defined out of existence** as a no-op success (deep-modules §6); any
 * other rejection becomes a {@link BucketProvisionError}.
 *
 * The `CreateBucket` call is **bare** — `{ Bucket: name }` with no `CreateBucketConfiguration` /
 * `LocationConstraint`: in `us-east-1` (the S3 default region) sending a `LocationConstraint` raises
 * `InvalidLocationConstraint`. The `client` is a parameter (no wiring captured here) so the same
 * primitive serves the dev/test LocalStack endpoint and a real AWS client.
 *
 * @example
 * ```ts
 * yield* ensureBucket(s3Client, 'lexiai-visuals')
 * ```
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
