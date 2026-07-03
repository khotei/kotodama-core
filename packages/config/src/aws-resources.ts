/**
 * The single source of AWS resource identity — each resource named exactly once, read by the dev
 * provisioner, the test harnesses, and the future Pulumi program. Imports NOTHING on purpose: the
 * plain-data invariant lets non-Effect Pulumi import it without pulling `effect` into the IaC
 * runtime. Names must mirror `.env.example`.
 */
export type AwsResource =
  | { readonly kind: 'sqs'; readonly name: string }
  | { readonly kind: 's3'; readonly name: string }

export const awsResources = {
  jobsQueue: { kind: 'sqs', name: 'kotodama-jobs' },
  imagesBucket: { kind: 's3', name: 'kotodama-images' },
} as const satisfies Record<string, AwsResource>

export const awsResourceList: readonly AwsResource[] = Object.values(awsResources)
