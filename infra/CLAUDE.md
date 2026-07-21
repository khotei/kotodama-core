# infra — `@kotodama/infra`

Local dev infra (Docker Compose) now; Pulumi production stack later.

- `local/docker-compose.yml`: **dev** Postgres (`kotodama_dev`) + LocalStack (SQS + S3) + Jaeger.
  No test DB is provisioned — DB tests use a throwaway Testcontainers Postgres
  (`@kotodama/core/database/testing`), so there's no `init/` SQL to seed a `kotodama_test`.
- Scripts: `local:up` / `local:down` (stop + remove containers, **keeps** data volumes) /
  `local:clean` (`down -v` — also removes volumes) / `local:logs` / `local:provision` (idempotently
  ensures the AWS-resource inventory on the running LocalStack — see below).
- No production deps yet; never imported by application code (the `local:provision` script *does*
  import the leaf packages — that constrains who imports `infra`, not what `infra` imports).
- The clone-to-real-word run-book lives in the root `readme.md` ("Run the backend locally (real
  engine)") — the home for the end-to-end steps; this file only points at it.

## How to add a new AWS resource

Resource identity lives in **one** list — `awsResources` in `@kotodama/platform/config`
(`packages/config/src/aws-resources.ts`). `local:provision` (dev), the test helpers, and the future
Pulumi stack all read it.

1. **Add one entry** to `awsResources` (`{ kind, name }`). That is the whole change for another
   queue/bucket of an existing kind.
2. **Add a new `ensure<Resource>`** (in the owning package) **only** for a genuinely new resource
   *type* (a new `kind`) — `ensureQueue` (`@kotodama/platform/queue`), `ensureBucket` (`@kotodama/platform/storage`).
3. **To *consume* the second resource**, add its config (one `Config` value) + **one more bound
   wrapper** — another `Layer` over the **existing** `QueueClient` / `StorageClient` base, binding the
   new URL/name (the way `JobsQueue` binds `JOBS_QUEUE_URL`, `ImagesStore` binds `IMAGES_BUCKET`).
   The base adapter is **unchanged** — it already takes the resource per call (F-PLAT-012). See
   `packages/queue/CLAUDE.md` / `packages/storage/CLAUDE.md` for the pattern.
4. `ensure*` is **dev/test-only**: prod `*Live` layers (`QueueClientLive`, `StorageClientLive`)
   only *consume* by URL/name and never self-provision. The `@aws-sdk/client-s3` devDependency
   boundary in `@kotodama/platform/storage` keeps `ensureBucket` off the `Bun.S3Client` prod path.
