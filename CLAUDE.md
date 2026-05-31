# LexiAI — Claude Code project context

LexiAI is a language-learning platform: users request words, the system generates rich word
entries (definitions, examples, images) via AI background jobs, and surfaces them through
spaced-repetition review. **This repo is the foundational Bun monorepo scaffolding** — strict
layering so every later feature ships cheaply. Authoritative product/architecture detail lives
in the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e); this file + the
`.claude/rules/` it imports are the working context.

## Runtime

**Bun 1.3** (pinned via `packageManager`, runs `.ts` directly) · **TypeScript strict** ·
**Effect v4 (beta)** — `Context.Service`/`Context.Tag`, in-beta APIs under `effect/unstable/*`.
Full table in `@.claude/rules/tech-stack.md`.

## Dependency hierarchy (the rule the scaffolding protects)

```
apps/web ─────────► packages/{schemas,http}      (FE ↔ contract only)
apps/{api,worker} ─► core/* ─► repositories/* ─► database/
                              │       │
                              ▼       ▼
                          packages/{schemas,ai,queue,storage,config,http,observability}
                          (everything → packages, packages → nothing internal)
```

Frontend (`apps/web`) is constrained to consume **only** `@lexiai/schemas` and `@lexiai/http`.
It never imports `core/`, `database/`, `repositories/`, or backend-only packages (`ai`,
`queue`, `storage`). This is the single most important rule the scaffolding must protect.
Enforced by Biome `noRestrictedImports`. Details: `@.claude/rules/dependency-hierarchy.md`.

## Root scripts

| Script | Does |
|---|---|
| `bun run bootstrap` | `bun install` |
| `bun run format` | Biome format & autofix |
| `bun run lint` | Biome lint |
| `bun run tsc` | Typecheck all workspaces (`bun run --filter '*' typecheck`) |
| `bun run test` | `@effect/vitest` per workspace (`bun run --filter '*' test`). NOT `bun test`. |
| `bun run check` | `lint` + `tsc` |
| `bun run --filter '@lexiai/<name>' <script>` | per-package dev/build/test/db:* |
| `bun run vendor:effect:update` | pull vendored Effect source (`repos/effect-smol`) |

## Commits & the pre-commit gate

Every commit follows `@.claude/rules/commits.md` (gitmoji + Conventional Commits +
decision-rich body + `Refs:` footer). Husky runs `biome check --staged` + `bun run tsc` on
commit; `git commit --no-verify` bypasses it — emergencies only, never on `main`.

PRs squash-merge into one such commit (title → subject, description → body, HTML comments
stripped), so the PR title/body follow the same `commits.md` format via
`@.claude/rules/pull-requests.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

## Rules (always loaded)

@.claude/rules/tech-stack.md
@.claude/rules/dependency-hierarchy.md
@.claude/rules/naming.md
@.claude/rules/tooling.md
@.claude/rules/commits.md
@.claude/rules/pull-requests.md
@.claude/rules/effect-conventions.md
@.claude/rules/vendored-sources.md
@.claude/rules/frontend-rules.md
@.claude/rules/testing.md
@.claude/rules/observability.md

## Per-layer context (loaded lazily when editing that subtree)

`apps/{api,worker,web}/CLAUDE.md` · `core/{words,jobs}/CLAUDE.md` · `database/CLAUDE.md` ·
`repositories/{words,jobs}/CLAUDE.md` · `packages/*/CLAUDE.md` · `infra/CLAUDE.md`.
Ancestor `CLAUDE.md` files (this one) always load; subdirectory ones load when you touch files
in that folder.

## Vendored repositories

`repos/effect-smol/` holds the **Effect v4 beta source** as read-only reference material so
coding agents read real patterns instead of guessing. **Never import from `repos/` in
application code; never edit it.** Before writing Effect code, consult `.claude/agent-patterns/*.md`
and the vendored source. Full rules: `@.claude/rules/vendored-sources.md`. Update via
`bun run vendor:effect:update`.

## Slash commands

`/check` (lint+tsc+test) · `/scan-deps` (verify layer rule) · `/new-package` (scaffold a workspace).
