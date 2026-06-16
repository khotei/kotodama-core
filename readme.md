# LexiAI

[![CI](https://github.com/khotei/lexi-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/khotei/lexi-ai/actions/workflows/ci.yml)

Bun-native TypeScript monorepo for **LexiAI** — a language-learning platform built on
Effect v4 / Bun 1.3 / AWS Lambda. Users request words; the system generates rich word
entries (definitions, examples, images) via AI background jobs and surfaces them through
spaced-repetition review.

> Product & architecture detail live in the
> [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e). This readme is for
> **getting the repo running**.

## Requirements

- **[Bun](https://bun.com/) 1.3.x** — `curl -fsSL https://bun.com/install | bash`
- **Docker** (for local Postgres + LocalStack)
- An **OpenAI API key** (for downstream AI features; not needed to boot the scaffold)

## Toolchain

Bun 1.3 · TypeScript (strict) · **Effect v4 (beta)** — `@effect/platform-bun`,
`@effect/sql-pg`, `@effect/ai-openai`, `@effect/opentelemetry`, `@effect/vitest` ·
**Drizzle** (schema + migrations) · **React 19** + Vite 6 + Tailwind v4 + TanStack Router +
`@effect/atom-react` (frontend) · **LocalStack** (local SQS + S3) · AWS Lambda / SQS / S3 /
RDS Postgres (prod) · OpenAI · **Biome** + **Husky** + **`@effect/vitest`**. Pulumi comes
later. Versions are pinned centrally via Bun **catalogs** in `package.json`.

## Project structure

```
lexiai/
├── apps/
│   ├── api/                 # HttpApi server (Lambda + local Bun.serve); owns the words contract
│   ├── worker/              # SQS consumer (Lambda + local long-poll)
│   └── web/                 # React 19 SPA (Vite)
├── core/
│   ├── words/               # WordModel + WordFinder (read use cases)
│   └── async-word-jobs/     # build orchestration + WordState/BuildOutcome use-case schemas
├── database/                # Drizzle schema, relations, migrations, seed
├── repositories/
│   ├── words/               # WordsRepo (Context.Service over Drizzle)
│   └── async-word-jobs/     # AsyncWordJobsRepo (per-stage word-gen rows)
├── packages/
│   ├── ai/                  # AiService (OpenAI text + image)
│   ├── queue/               # QueueService (SQS Layer)
│   ├── storage/             # StorageService (Bun.S3Client Layer)
│   ├── config/              # AppConfig from effect/Config
│   ├── observability/       # OpenTelemetry Layer factory
│   └── utils/               # dependency-free generic TS helpers
├── infra/                   # Pulumi (later) + Docker Compose for local
├── repos/                   # vendored read-only library source (effect-smol)
├── .claude/                 # Claude Code context: CLAUDE.md, rules, commands,
│                            #   settings, agent-patterns/ (Effect cheat sheets)
├── .husky/                  # pre-commit gate
├── biome.json · tsconfig.base.json · vitest.base.ts · package.json
```

## How it works (short)

A word lookup hits the DB (`repositories/words`) if present. On a miss, `core/words`
enqueues a generate-word job to SQS (`packages/queue`); `apps/worker` consumes it, calls
OpenAI (`packages/ai`) + stores images (`packages/storage`), and writes the entry back.
`apps/api` owns the `HttpApi` contract (`apps/api/src/words/words.api.ts`); `apps/web` imports
no internal package yet (its contract surface is re-established with the UI). See the Tech spec §1
for the full topology.

## Dependency flow

```
apps/{api,worker} ─► core/* ─► repositories/* ─► database/   (database authors vocabulary + WordEntity)
                       │  ▲ core derives WordModel from WordEntity
                       ▼
                   packages/{ai,queue,storage,config,observability}
                   (everything → packages, packages → nothing internal)
```

Allowed direction only: **apps → core → repositories → database**, and **everything →
packages**. `database/` is the bottom and authors the word vocabulary + `WordEntity`; `core/`
builds `WordModel` from it. The frontend (`apps/web`) may import **no** internal package (there is
no vocabulary package — `packages/schemas` was deprecated). Enforced by Biome (`noRestrictedImports`).

## Quick start

```bash
# 1. Install Bun (see Requirements), then dependencies:
bun bootstrap                                   # = bun install

# 2. Start local infra (Postgres + LocalStack + Jaeger); blocks until ready:
bun run --filter '@lexiai/infra' local:up    # Jaeger UI → http://localhost:16686

# 3. Environment:
cp .env.example .env                            # tests need no .env.test (see Testing)

# 4. Migrate the dev DB:
bun run --filter '@lexiai/database' db:migrate

# 5. Run the apps:
bun run --filter '@lexiai/app-api' dev          # logs "api booting…"
bun run --filter '@lexiai/app-web' dev          # Vite dev server + HMR
```

No `git subtree init` or submodule step is needed after clone — `repos/effect-smol/` is
already present at HEAD.

## Development

- Per-app dev servers via `bun run --filter '@lexiai/<name>' dev`. `apps/web` has Vite HMR.
- Add a workspace with the `/new-package` Claude Code command (scaffolds package.json,
  tsconfig, src, smoke test, CLAUDE.md in the correct layer).

## Testing

```bash
bun run test                                    # all workspaces (@effect/vitest)
bun run --filter '@lexiai/database' test         # one workspace
```

Use `bun run test`, **not** `bun test` (the latter is Bun's built-in runner). Tests that
touch the DB spin up an **ephemeral Testcontainers Postgres** (needs Docker), migrate it at
layer build, and reset state between tests — never the dev DB, so there is no `.env.test`
(per Tech spec §18; see `.claude/rules/testing.md`). The project list is single-sourced from
`package.json#workspaces`: each workspace has a one-line `vitest.config.ts` (re-exporting the
root `vitest.base.ts`) and `bun run test` fans out per workspace via
`bun run --filter '*' test`. See `.claude/rules/tooling.md`.

## Code quality

```bash
bun run format     # Biome format & autofix
bun run lint       # Biome lint (includes layer-import rules)
bun run tsc        # typecheck all workspaces (bun run --filter '*' typecheck)
bun run check      # lint + tsc
```

A **Husky** pre-commit hook runs `biome check --staged` + `bun run tsc` and blocks bad commits.
Emergency bypass: `git commit --no-verify` (never on `main`). Commits follow
`.claude/rules/commits.md` (gitmoji + Conventional Commits + a `Decision:` paragraph).

## Pull requests

PRs are **squash-merged**: each PR collapses to a single commit on `main` whose **subject is
the PR title** and **body is the PR description** — verbatim, with HTML comments stripped.
`.github/PULL_REQUEST_TEMPLATE.md` is authored so a filled-in PR squash-merges into a valid
`commits.md`-style commit with no hand-editing — Summary / What changed / How it works
(optional Mermaid diagram in a `<details>`) / Decisions / Refs survive into history; the
reviewer-only block (checklist, test plan, screenshots) lives in an `<!-- … -->` comment and
disappears. See `.claude/rules/pull-requests.md` and the worked example in
`.github/PULL_REQUEST_example.md`.

**Required GitHub setting** (a fresh fork must enable this for the mechanism to work):
*Settings → General → Pull Requests* → **Allow squash merging** with **Default commit message
= "Pull request title and description"**. Equivalently via the repo API:
`squash_merge_commit_title=PR_TITLE` and `squash_merge_commit_message=PR_BODY`. Without it,
squash falls back to concatenating branch commits and the template has no effect. (Can be
codified later if repo settings-as-code is adopted.)

## Infrastructure

Local: `infra/local/docker-compose.yml` (dev Postgres `lexiai_dev`, LocalStack SQS + S3,
Jaeger) via `local:up` / `local:down` / `local:logs`. DB tests use a throwaway Testcontainers
Postgres, so no test DB is provisioned here. Production Pulumi stack is a later feature.

## Observability

Backend apps emit OpenTelemetry traces via `TracingLive` from `@lexiai/observability`
(provided at each entrypoint). Locally they export to the **Jaeger** container — bring up
infra, run an app, then open **http://localhost:16686**, pick service `lexiai-api` /
`lexiai-worker`, and inspect spans. The export target follows the standard
`OTEL_EXPORTER_OTLP_ENDPOINT` env var (defaults to the local Jaeger; inert in production
until set to a real OTLP backend). Conventions: `.claude/rules/observability.md`.

> We use OTel→Jaeger rather than Effect's DevTools panel: DevTools is VS Code/Cursor-only
> and local-dev-only, whereas OTel renders in Jaeger locally and in X-Ray/Grafana/etc. in
> production from the same wiring.

## Documentation

- **Tech spec** (authoritative): https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e
- **AI-agent context:** `.claude/` (root `CLAUDE.md` + `.claude/rules/*` + per-layer
  `CLAUDE.md`). Opening the repo in Claude Code loads this automatically.

## Vendored sources for coding agents

`repos/effect-smol/` vendors the **Effect v4 beta source** as **read-only reference
material** (set up via `git subtree --squash`) so coding agents read real implementation
patterns instead of guessing from out-of-date docs. Update it with:

```bash
bun run vendor:effect:update
```

**Never import from `repos/` in application code, and never edit it.** `.claude/agent-patterns/*.md`
are project-local cheat sheets pointing into the vendored source;
`.claude/rules/vendored-sources.md` holds the full rules. See the Effect guide
["the one weird git trick"](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/)
and [Coding with LLMs](https://effect.website/docs/getting-started/introduction/#coding-with-llms).

### Editor setup

`repos/` is excluded from editor indexing/search/auto-import: JetBrains IntelliJ via
`.idea/*.iml` `<excludeFolder>` (the primary IDE); VSCode via `.vscode/settings.json`. Other
editors (Zed, Neovim, Helix…) — add the equivalent "exclude `repos/**`" setting locally.

**Effect language service** (`@effect/language-service`, registered in `tsconfig.base.json`
`plugins`) adds Effect-aware diagnostics, quick-fixes, and type hints in the editor. It runs
only in the editor's TypeScript server — never in `bun run tsc` or CI. To enable it you must
point the IDE at the **workspace** TypeScript, not its bundled one:

- **JetBrains (primary):** *Settings → Languages & Frameworks → TypeScript* → set
  TypeScript to `node_modules/typescript`, and ensure the TypeScript Language Service is on.
- **VSCode/Cursor:** *TypeScript: Select TypeScript Version → Use Workspace Version*.
