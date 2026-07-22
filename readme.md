<div align="center">

# 言霊 · Kotodama

**The soul of words** — request a word; an AI background job builds a full entry
(definitions, examples, images) and surfaces it for spaced-repetition review.

[![CI](https://github.com/khotei/kotodama-core/actions/workflows/ci.yml/badge.svg)](https://github.com/khotei/kotodama-core/actions/workflows/ci.yml)
![Bun](https://img.shields.io/badge/Bun-1.3-000?logo=bun&logoColor=fbf0df)
![Effect](https://img.shields.io/badge/Effect-v4_beta-5a67d8)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)

</div>

> *Kotodama* (言霊) — the old belief that words carry a living power that shapes reality. A fitting
> name for **the core**: the backend that turns a bare word into a living entry. This is the whole
> server side — the HTTP API, the asynchronous build pipeline, and the strict Effect-typed domain
> beneath them — a Bun monorepo with the layer rule enforced at lint time.

> The **why / what** is the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e)
> (authoritative). This README is the **front door** — what this is and how to run it. Depth is
> linked, never restated: conventions in `.claude/rules/*` + per-layer `CLAUDE.md` (auto-loaded in
> Claude Code, plain markdown otherwise).

## How it works

```
POST /api/words/en/lacuna/build
        │
        ▼
   requestWordBuild ──► words row exists?  ──yes──►  already Ready
        │ no
        ▼
   seed job + enqueue ──► SQS (platform/queue)
                              │
                              ▼
                      apps/worker consumes ──► buildWord
                              │                    ├─ OpenAI text + image  (platform/ai)
                              │                    └─ store images          (platform/storage)
                              ▼
                      writes the entry back ──► words row  (a word exists ⇔ every stage succeeded)
        │
        ▼
GET /api/words/en/lacuna/state  ──►  running → … → succeeded
```

A read hits the DB; a miss enqueues a build the worker fulfils asynchronously, then the entry is
read back. Full topology: [Tech spec §1](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e).

## The stack

Identity only — exact versions are pinned centrally in Bun **catalogs**
([`package.json`](package.json)), the single source, so they aren't restated here.

| Tool | Why it's here |
|---|---|
| **Bun** | Runtime + package manager; runs `.ts` directly, no build step in MVP |
| **TypeScript (strict)** | One typed language end to end |
| **Effect v4 (beta)** | DI (`Context.Service`/`Layer`), typed errors, structured concurrency |
| **`@effect/platform-bun`** | HTTP server + entrypoints; deploys to AWS Lambda |
| **Drizzle + `@effect/sql-pg`** | Schema + migrations; the Effect-native Postgres layer |
| **`@effect/ai-openai`** | Word text + image generation |
| **SQS + S3** (LocalStack locally) | Async job queue + generated-image storage |
| **Biome + Husky** | Lint/format + the pre-commit gate; encodes the layer rule |
| **`@effect/vitest`** | Tests, one smoke per workspace |
| **OpenTelemetry → Jaeger** | Traces, local and prod, from one wiring |

## Repository layers

Responsibilities, not a file tree (a tree drifts) — each folder carries its own `CLAUDE.md` for
detail.

| Layer | Owns | Why it's here |
|---|---|---|
| `apps/{api,worker}` | HTTP-contract server · SQS consumer | the process boundaries |
| `core/use-cases/` | end-to-end flow composers (`requestWordBuild`, `buildWord`) | one place a flow is assembled |
| `core/{words,content}` | domain logic + the `ContentEngine` swap seam | the rules a flow runs |
| `core/repositories/` | bare persistence functions over the DB layer | the only SQL surface |
| `database/` | Drizzle schema + the word vocabulary + `WordEntity` | the bottom; authors the row shapes |
| `platform/{ai,queue,storage,config,external-apis,observability,…}` | boundary adapters + leaf infra | import nothing internal |
| `infra/` | Docker Compose (local) · Pulumi (later) · `local:*` scripts | dev/ops, never imported by app code |

The middle tiers are layer folders of the single `@kotodama/core` package (subpath-exported);
`database` is its own bottom-of-chain `@kotodama/database` workspace; `platform/*` are the adapter
folders of the single leaf `@kotodama/platform`.

**Dependency direction** (enforced by Biome): `apps → use-cases → core → repositories → database`,
and everything → `platform`. The full rule + enforcement lives in
[`.claude/rules/dependency-hierarchy.md`](.claude/rules/dependency-hierarchy.md).

## Requirements

- **[Bun](https://bun.com/) 1.3.x** — `curl -fsSL https://bun.com/install | bash`
- **Docker** — local Postgres + LocalStack (SQS + S3) + Jaeger
- A **real OpenAI API key** — the build pipeline calls OpenAI for text + images. Create one at
  [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (needs an OpenAI account with
  billing enabled — generation spends credit). The `.env.example` ships a `sk-local-placeholder` that
  passes config checks but cannot generate; the real key is the one value you must supply.

## Run it

The full path from a fresh clone to a real AI-generated word — one quick-start, no undocumented
manual steps.

```bash
# 1. Environment — copy fresh, set a real OpenAI key (the only real value needed; the placeholder
#    AWS creds in .env.example are accepted by LocalStack).
cp .env.example .env                              # set OPENAI_API_KEY=sk-…

# 2. Dependencies.
bun install

# 3. Local infra in ONE command — Postgres + LocalStack + Jaeger, waits healthy, migrates the DB,
#    provisions the SQS queue + S3 bucket.
bun run --filter '@kotodama/infra' local:up

# 4. The two backend apps, each in its own terminal.
bun run --filter '@kotodama/app-api' dev            # HTTP API on :3000
bun run --filter '@kotodama/app-worker' dev         # the worker poll-loop

# 5. Prove the real-engine path end to end — builds a word and polls until it reports `succeeded`.
bun run --filter '@kotodama/infra' local:smoke      # en/lacuna by default; pass `<word> <language>` to vary
```

Traces at Jaeger **http://localhost:16686**; generated images land in the LocalStack `kotodama-images`
bucket. Full reset: `local:clean && local:up` (both bring-up steps are idempotent).

## Environments

The same code runs in three environments; what changes between them is **where configuration comes
from** — resource *identity* (queue/bucket names) is single-sourced in
[`platform/config`](platform/config/src/aws-resources.ts), only the connection facet varies.

| | Local dev | Test | Production |
|---|---|---|---|
| **Run with** | `local:up` + the `dev` apps | `bun run test` (needs Docker; **not** `bun test`) | AWS Lambda (api + worker) |
| **Infra** | Docker Compose — Postgres + LocalStack + Jaeger | ephemeral Testcontainers per file | real RDS Postgres · SQS · S3 |
| **Config from** | repo-root `.env` (fallback under `process.env`) | each container's own endpoint — never `.env`, never the dev stack | env injected by the Lambda role |
| **Resources** | created by `local:provision` | created per file (`ensureQueue`/`ensureBucket`) | IaC-owned; the app only consumes |

The invariants behind the matrix — why a test structurally cannot touch the dev stack, why prod
never self-provisions — are owned by [`.claude/rules/config.md`](.claude/rules/config.md) ·
[`.claude/rules/testing.md`](.claude/rules/testing.md).

## Contributing

Every convention has one authoritative home in [`.claude/rules/`](.claude/rules/) — auto-loaded in
Claude Code, plain markdown for humans:

- **Commits** — gitmoji + Conventional Commits + a `Decision:` paragraph:
  [`commits.md`](.claude/rules/commits.md). **PRs squash-merge**, so the description *is* the
  permanent history: [`pull-requests.md`](.claude/rules/pull-requests.md).
- **Pre-commit gate** — Husky runs `biome check --staged` + `bun run tsc`; tests are CI-only.
  Scripts + the root-less config setup: [`tooling.md`](.claude/rules/tooling.md).
- **New workspace** — the `/new-package` command scaffolds it with zero root-config edits.
- **Vendored sources** — `repos/effect-smol/` holds the Effect v4 source as read-only reference
  (`bun run vendor:effect:update`); never import from it:
  [`vendored-sources.md`](.claude/rules/vendored-sources.md).
- **MCP servers (optional, deliberately not in the repo)** — personal tooling, so each developer
  installs their own into Claude Code's **local scope** (stored per project in `~/.claude.json`,
  never committed), baking this project's env at add time. The recommended trio:

  ```bash
  claude mcp add postgres -e DATABASE_URI=postgres://postgres:postgres@localhost:5432/kotodama_dev \
    -- docker run -i --rm -e DATABASE_URI crystaldba/postgres-mcp --access-mode=restricted
  claude mcp add pulumi -- npx -y @pulumi/mcp-server@latest stdio
  claude mcp add aws -e AWS_PROFILE=<your-profile> -e AWS_REGION=us-east-1 \
    -- uvx awslabs.aws-api-mcp-server@latest

  # Need the same service against two environments (e.g. a second, production DB)? Add it twice
  # under distinct names — tools arrive prefixed per server, so they can't be confused. Works for
  # any MCP server; keep production access read-only:
  claude mcp add postgres-prod -e DATABASE_URI=postgres://<user>@<prod-host>:5432/kotodama \
    -- docker run -i --rm -e DATABASE_URI crystaldba/postgres-mcp --access-mode=restricted
  ```

## Docs

- **[Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e)** — the authoritative why/what
- **[`.claude/`](.claude/)** — the project `CLAUDE.md` + `.claude/rules/*` + per-layer `CLAUDE.md`:
  the conventions and per-layer detail, one owner per fact.
