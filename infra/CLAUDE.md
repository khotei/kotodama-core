# infra — `@kotodama/infra`

The dev/ops umbrella, organized as **one folder per concern** (mirroring `core`'s layer folders,
minus the exports — nothing imports `infra`; no `src/`): each module folder is self-contained and
names the script prefix that drives it (`local/` ↔ `local:*`).

- **`local/`** — the local dev stack: `docker-compose.yml` (**dev** Postgres `kotodama_dev` +
  LocalStack SQS/S3 + Jaeger) + `provision.ts`. No test DB is provisioned — DB tests use a
  throwaway Testcontainers Postgres (`@kotodama/database/testing`), so there's no `init/` seed SQL.
- **`presets/`** — a **separate workspace** (`@kotodama/presets`, the shared config presets) that
  only *lives* here as the dev-surface umbrella — `.claude/rules/tooling.md` owns it. Not
  `platform/`: platform is runtime code the app imports; presets are dev-only devDependencies of
  every workspace (including `platform` itself).
- **`deploy/`** (future) — the Pulumi/AWS production stack, under `deploy:*` scripts; reads the
  same `awsResources` inventory as `local:provision` — the designed reuse seam between dev and deploy.

Scripts: `local:up` / `local:down` (keeps data volumes) / `local:clean` (`down -v`) / `local:logs` /
`local:provision` (idempotently ensures the AWS inventory on the running LocalStack — see below).

- **No tests and no `test` script by design** (the `--filter '*'` gate skips it, like
  `@kotodama/presets`): `ensure*` is tested in `platform/{queue,storage}`; the compose file is
  provable only by running it — the end-to-end proof is the readme quick-start curl, later a
  CI/CD post-deploy smoke in `deploy/`.
- No production deps; never imported by application code (`local:provision` *does* import the leaf
  packages — that constrains who imports `infra`, not what `infra` imports). The clone-to-real-word
  run-book lives in the root `readme.md`; this file only points at it.

## How to add a new AWS resource

Resource identity lives in **one** list — `awsResources` in `@kotodama/platform/config`
(`platform/config/src/aws-resources.ts`). `local:provision` (dev), the test helpers, and the future
Pulumi stack all read it.

1. **Add one entry** to `awsResources` (`{ kind, name }`). That is the whole change for another
   queue/bucket of an existing kind.
2. **Add a new `ensure<Resource>`** (in the owning package) **only** for a genuinely new resource
   *type* (a new `kind`) — `ensureQueue` (`@kotodama/platform/queue`), `ensureBucket` (`@kotodama/platform/storage`).
3. **To *consume* the second resource**, add its config (one `Config` value) + **one more bound
   wrapper** — another `Layer` over the **existing** `QueueClient` / `StorageClient` base, binding the
   new URL/name (the way `JobsQueue` binds `JOBS_QUEUE_URL`, `ImagesStore` binds `IMAGES_BUCKET`).
   The base adapter is **unchanged** — it already takes the resource per call (F-PLAT-012). See
   `platform/queue/CLAUDE.md` / `platform/storage/CLAUDE.md` for the pattern.
4. `ensure*` is **dev/test-only**: prod `*Live` layers (`QueueClientLive`, `StorageClientLive`)
   only *consume* by URL/name and never self-provision. The `@aws-sdk/client-s3` devDependency
   boundary in `@kotodama/platform/storage` keeps `ensureBucket` off the `Bun.S3Client` prod path.
