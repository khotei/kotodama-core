# infra — `@kotodama/infra`

The dev/ops umbrella, one self-contained folder per concern; nothing imports it (no `src/`), and each
folder names the script prefix that drives it (`local/` ↔ `local:*`).

- **`local/`** — `docker-compose.yml` (dev Postgres + LocalStack SQS/S3 + Jaeger) + `provision.ts`.
  No test DB and no `init/` seed SQL: DB tests use throwaway Testcontainers.
- **`presets/`** — a *separate* workspace (`@kotodama/presets`) that only *lives* here as the
  dev-surface umbrella (`.claude/rules/tooling.md` owns it). Not under `platform/`: platform is
  runtime code the app imports; presets are dev-only devDependencies of every workspace (platform
  included).
- **`deploy/`** (future) — the Pulumi/AWS stack; reads the same `awsResources` inventory as
  `local:provision`, the designed dev↔deploy reuse seam.
- **No tests / no `test` script by design** (the `--filter '*'` gate skips it): `ensure*` is tested in
  `platform/{queue,storage}`; the compose file is proven only by running (the readme curl, later a
  `deploy/` smoke). `local:provision` *imports* the leaf packages — that constrains who imports
  `infra`, not what it imports. The clone-to-real run-book lives in the root `readme.md`.

## Adding an AWS resource

Resource identity lives in **one** list — `awsResources` in `@kotodama/platform/config` — read by
`local:provision`, the test helpers, and the future Pulumi stack.

1. Another queue/bucket of an existing kind = one `{ kind, name }` entry.
2. A genuinely new *kind* also needs a new `ensure<Resource>` in the owning package (`ensureQueue`,
   `ensureBucket`).
3. To *consume* it: one `Config` value + **one bound `Layer`** over the existing `QueueClient` /
   `StorageClient` base (the base already takes the resource per call — unchanged).
4. `ensure*` is **dev/test-only**; prod `*Live` layers only consume by URL/name, never self-provision
   (the `@aws-sdk/client-s3` devDependency boundary keeps `ensureBucket` off the `Bun.S3Client` prod
   path).
