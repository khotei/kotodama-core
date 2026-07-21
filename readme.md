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
> linked, never restated: operational detail in [`docs/`](#docs--conventions); conventions in
> `.claude/rules/*` + per-layer `CLAUDE.md` (auto-loaded in Claude Code).

## How it works

```
POST /api/words/en/lacuna/build
        │
        ▼
   requestWordBuild ──► words row exists?  ──yes──►  already Ready
        │ no
        ▼
   seed job + enqueue ──► SQS (packages/queue)
                              │
                              ▼
                      apps/worker consumes ──► buildWord
                              │                    ├─ OpenAI text + image  (packages/ai)
                              │                    └─ store images          (packages/storage)
                              ▼
                      writes the entry back ──► words row  (a word exists ⇔ every stage succeeded)
        │
        ▼
GET /api/words/en/lacuna/state  ──►  running → … → succeeded
```

A read hits the DB; a miss enqueues a build the worker fulfils asynchronously, then the entry is
read back. Full topology: [Tech spec §1](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e) ·
[`docs/architecture.md`](docs/architecture.md).

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
| `use-cases/` | end-to-end flow composers (`requestWordBuild`, `buildWord`) | one place a flow is assembled |
| `core/{words,content}` | domain logic + the `ContentEngine` swap seam | the rules a flow runs |
| `repositories/` | bare persistence functions over the DB layer | the only SQL surface |
| `database/` | Drizzle schema + the word vocabulary + `WordEntity` | the bottom; authors the row shapes |
| `packages/{ai,queue,storage,config,observability,…}` | boundary adapters + leaf infra | import nothing internal |
| `infra/` | Docker Compose (local) · Pulumi (later) · `local:*` scripts | dev/ops, never imported by app code |

**Dependency direction** (enforced by Biome): `apps → use-cases → core → repositories → database`,
and everything → `packages`. The full rule + enforcement lives in
[`.claude/rules/dependency-hierarchy.md`](.claude/rules/dependency-hierarchy.md); the topology map is
[`docs/architecture.md`](docs/architecture.md).

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
bucket. Full reset: `local:clean && local:up` (both bring-up steps are idempotent). How this differs
across **local / test / prod** — and why — is [`docs/running.md`](docs/running.md).

## Docs & conventions

- **[`docs/running.md`](docs/running.md)** — running across local dev / test / prod (config provenance)
- **[`docs/architecture.md`](docs/architecture.md)** — the topology map (link-hub)
- **[`docs/contributing.md`](docs/contributing.md)** — scripts, tests, commits, PRs, the pre-commit gate
- **[Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e)** — the authoritative why/what
- **`.claude/`** — AI-agent context (root `CLAUDE.md` + `.claude/rules/*` + per-layer `CLAUDE.md`),
  loaded automatically in Claude Code; `repos/effect-smol/` vendors the Effect v4 source as read-only
  reference (`bun run vendor:effect:update`).
