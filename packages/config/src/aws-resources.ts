/**
 * The single source of AWS *resource identity* — the queue + bucket the app provisions and talks to.
 * Every consumer reads this one place, so each resource is named exactly once and they can't drift:
 * the Effect-side `ensure*` calls (dev `local:provision` **and** the LocalStack test harnesses), and
 * the future non-Effect Pulumi provisioning program.
 *
 * Keyed by a stable *logical id* (`jobsQueue`, `imagesBucket`) — the id Pulumi will key its resources
 * by, and the handle direct callers reference (`awsResources.jobsQueue.name`). {@link awsResourceList}
 * is the same inventory as an array, for callers that provision *every* entry by iterating + dispatch
 * on `kind` (`local:provision`, Pulumi).
 *
 * Imports **nothing** on purpose: the plain-data invariant lets the non-Effect Pulumi program import
 * it without pulling `effect` into the IaC runtime (Tech spec §2.5 — "no Effect↔Pulumi marriage").
 * Names mirror `.env.example` (`JOBS_QUEUE_URL` leaf `lexiai-jobs`; `IMAGES_BUCKET` `lexiai-images`);
 * the test harnesses reuse these same names — isolation is per-file *container*, not a distinct name.
 */
export type AwsResource =
  | { readonly kind: 'sqs'; readonly name: string }
  | { readonly kind: 's3'; readonly name: string }

/** Adding a resource? See "How to add a new AWS resource" in `infra/CLAUDE.md` — add ONE entry here. */
export const awsResources = {
  jobsQueue: { kind: 'sqs', name: 'lexiai-jobs' },
  imagesBucket: { kind: 's3', name: 'lexiai-images' },
} as const satisfies Record<string, AwsResource>

/** The inventory as a list — for provisioners that ensure every resource (`local:provision`, Pulumi). */
export const awsResourceList: readonly AwsResource[] = Object.values(awsResources)
