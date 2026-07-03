# Running Kotodama across environments

*Diátaxis: how-to.* The same code runs in three environments; what changes between them is **where
configuration comes from** — so that is how this guide is keyed. Commands name a `package.json`
script (the single source); the prose explains only the *why*.

| | Local dev | Test | Production |
|---|---|---|---|
| **Run with** | `local:up` + the `dev` apps | `bun run test` | AWS Lambda (api + worker) |
| **Infra** | Docker Compose — Postgres + LocalStack (SQS/S3) + Jaeger | ephemeral Testcontainers per file | real RDS Postgres · SQS · S3 |
| **Config comes from** | repo-root `.env` (fallback under `process.env`) via `ConfigProviderLive` | a **replacement** `ConfigProvider` built from each container's endpoint | env injected by the Lambda execution role |
| **AWS endpoint** | `AWS_ENDPOINT_URL=…:4566` (LocalStack) | the container's endpoint | unset → the real AWS endpoint |
| **Resources** | created by `local:provision` (dev-only) | created per-file by `ensureQueue`/`ensureBucket` | created by IaC (Pulumi, later); the app only consumes |

The load-bearing idea: **identity (resource names) is single-sourced; only the connection facet
changes per environment.** Names live once in `packages/config/src/aws-resources.ts`; the URL/endpoint
is what differs.

## Environment (`.env`)

Only **local dev** reads a `.env` file (test derives config from its containers; prod from the Lambda
env — see the matrix). [`.env.example`](../.env.example) is the **annotated single source** for every
key — it explains each one inline, so they aren't restated here.

`cp .env.example .env` is meant to **work out of the box** for local dev: every value is a working
default wired to the `local:up` stack — the dev Postgres URL, the LocalStack `:4566` endpoint, the
`kotodama-images` / `kotodama-jobs` names, the placeholder `test` AWS credentials (LocalStack ignores
them), the port, and the log level. **Leave them as they are.**

The **one value you must supply is `OPENAI_API_KEY`** — a real key (the shipped `sk-local-placeholder`
passes config validation but cannot generate). Where to get it: [README → Requirements](../readme.md#requirements).
That is the single gap between a fresh clone and a working real-engine run; everything else is already
correct for local. How the keys are *consumed* (the `Config` definitions): `packages/config/src/index.ts`
+ [`.claude/rules/config.md`](../.claude/rules/config.md).

## Local dev

One quick-start lives in the [README](../readme.md#run-it) — don't duplicate it. The *why*:

- **`local:up`** ([`@kotodama/infra`](../infra/package.json)) is idempotent and does everything in order:
  starts the containers and waits healthy, migrates the dev DB, then `local:provision` creates the SQS
  queue + S3 bucket from the inventory. New AWS resource? See
  [`infra/CLAUDE.md`](../infra/CLAUDE.md#how-to-add-a-new-aws-resource).
- **Config provenance:** `ConfigProviderLive` loads the repo-root `.env` as a *fallback* under
  `process.env` (a real exported var, or Bun's own `.env` auto-load, wins) — so the `.env` above is what
  the apps read. Details: [`.claude/rules/config.md`](../.claude/rules/config.md).
- **Prove it:** `local:smoke` builds a word and polls to `succeeded` — the runnable check the README
  quick-start ends on.

## Test

```bash
bun run test                                   # all workspaces; bun run --filter '@kotodama/<name>' test for one
```

- **No `.env.test`, and the dev stack is never touched.** Each DB-touching suite spins an **ephemeral
  Testcontainers Postgres** and builds its `PgClient` from the *container's* `getConnectionUri()` — not
  `@kotodama/config`'s `DatabaseUrl`. Each AWS-touching suite boots a per-file LocalStack container and
  resolves the `@kotodama/config` AWS seam from a **replacement `ConfigProvider`** built from that
  container's endpoint. **`ConfigProviderLive` is never in the test layer graph** — the *dev-untouched
  invariant*, the reason a test can never reach the dev LocalStack or dev DB.
- **Why containers, not fakes:** the real adapter is exercised at the seam (no divergent in-memory
  double). Rationale + the per-suite helpers: [`.claude/rules/testing.md`](../.claude/rules/testing.md),
  [`packages/queue/CLAUDE.md`](../packages/queue/CLAUDE.md).
- Needs **Docker** running. Use `bun run test`, **not** `bun test` (Bun's built-in runner) —
  [`.claude/rules/tooling.md`](../.claude/rules/tooling.md).

## Production

- **Deploy:** the api + worker run on **AWS Lambda** (`BunRuntime.runMain` entrypoints via the Lambda
  Web Adapter). The architecture is the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e)
  §2; the IaC (Pulumi) stack is a later feature.
- **Config provenance:** the Lambda execution role injects AWS credentials (incl. `AWS_SESSION_TOKEN`)
  into the environment, which the same `AwsClientConfig` resolves. `AWS_ENDPOINT_URL` is **unset**, so
  the SDKs hit real AWS. There is no `.env` file in the Lambda image — `ConfigProviderLive`'s
  `.env` fallback reads empty and `process.env` supplies everything.
- **Resources are IaC-owned.** The app **never self-provisions** in prod: `ensure*` is dev/test-only,
  and the `@aws-sdk/client-s3` dev-dependency boundary keeps it off the `Bun.S3Client` prod path. The
  `*Live` layers only ever consume a queue URL / bucket name.

## See also

- [README → Run it](../readme.md#run-it) — the local quick-start
- [`docs/architecture.md`](architecture.md) — what each layer is
- [`.claude/rules/`](../.claude/rules/) — `config` · `testing` · `tooling` · `observability` (the
  authoritative conventions)
