# Kotodama — Claude Code project context

Kotodama is a language-learning platform: users request words, the system generates rich word
entries (definitions, examples, images) via AI background jobs, and surfaces them through
spaced-repetition review. **This repo is the foundational Bun monorepo scaffolding** — strict
layering so every later feature ships cheaply. Authoritative product/architecture detail lives
in the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e); this file + the
`.claude/rules/` Claude Code auto-loads are the working context.

## Runtime

**Bun 1.3** (pinned via `packageManager`, runs `.ts` directly) · **TypeScript strict** ·
**Effect v4 (beta)** — `Context.Service`/`Context.Tag`, in-beta APIs under `effect/unstable/*`.
Full table in `.claude/rules/tech-stack.md`.

## Dependency hierarchy (the rule the scaffolding protects)

```
apps/{api,worker} ─► use-cases/* ─► core/* ─► repositories/* ─► database/   (database authors vocabulary + WordEntity)
                                      │  ▲ use-cases/core/apps consume WordEntity/WordRow directly
                                      ▼
                                  packages/{ai,queue,storage,config,observability}
                                  (everything → packages, packages → nothing internal)
```

`use-cases/*` is the top application tier below `apps/*`: user-flow composer functions (`requestWordBuild`,
`buildWord`) that aggregate `core/*` functions + the repo functions into one end-to-end flow an app binds.
Details: `.claude/rules/dependency-hierarchy.md`.

## Root scripts

| Script | Does |
|---|---|
| `bun run bootstrap` | `bun install` |
| `bun run format` | Biome format & autofix |
| `bun run lint` | Biome lint |
| `bun run tsc` | Typecheck all workspaces (`bun run --filter '*' typecheck`) |
| `bun run test` | `@effect/vitest` per workspace (`bun run --filter '*' test`). NOT `bun test`. |
| `bun run check` | `lint` + `tsc` |
| `bun run --filter '@kotodama/<name>' <script>` | per-package dev/build/test/db:* |
| `bun run vendor:effect:update` | pull vendored Effect source (`repos/effect-smol`) |

## Commits & the pre-commit gate

Every commit follows `.claude/rules/commits.md` (gitmoji + Conventional Commits +
decision-rich body + `Refs:` footer). Husky runs `biome check --staged` + `bun run tsc` on
commit; `git commit --no-verify` bypasses it — emergencies only, never on `main`.

PRs squash-merge into one such commit (title → subject, description → body, HTML comments
stripped), so the PR title/body follow the same `commits.md` format via
`.claude/rules/pull-requests.md` and `.github/PULL_REQUEST_TEMPLATE.md`.

## Rules (`.claude/rules/`)

Claude Code **auto-discovers** every `.claude/rules/*.md` — no `@`-import needed (an `@`-import
would re-load the file on top of discovery and force-load it every session, defeating path-scoping).
Cross-cutting rules load **always**; the rest are **path-scoped** via `paths:` frontmatter and load
only when you touch a matching file, keeping the always-on context lean (Claude Code guidance:
target < 200 lines of always-loaded context per file; bloat reduces adherence).

- **Always:** `tech-stack` · `dependency-hierarchy` · `naming` · `comments` · `tooling` ·
  `commits` · `pull-requests` · `claude-md`.
- **Path-scoped (load on match):** `effect-conventions`, `vendored-sources` → `**/*.ts` ·
  `drizzle-effect` → `database/**`, `repositories/**` · `config` → `packages/config/**`,
  `**/main.ts` · `testing` → `**/test/**`, `**/*.test.ts` · `observability` →
  `packages/observability/**`, `apps/**` · `sdd` → `.claude/{commands,agents,sdd}/**` ·
  `human-docs` → `readme.md`, `docs/**`.
- **On-demand reference (pointer-loaded, NOT auto-loaded):** `.claude/agent-patterns/*.md` —
  Effect/Drizzle/Postgres/type-fest/modern-TS/design-principles cheat-sheets and
  `commit-examples.md`. Linked from the rules/commands that need them; never put on-demand depth
  in `.claude/rules/` (it would auto-load).

## Per-layer context (loaded lazily when editing that subtree)

`apps/{api,worker}/CLAUDE.md` · `use-cases/CLAUDE.md` · `core/{words,content}/CLAUDE.md` ·
`database/CLAUDE.md` · `repositories/words/CLAUDE.md` · `packages/*/CLAUDE.md` ·
`infra/CLAUDE.md`.
Ancestor `CLAUDE.md` files (this one) always load; subdirectory ones load when you touch files
in that folder.

## Maintaining these docs

`.claude/` files are context, not a changelog. **Don't rewrite a rule or `CLAUDE.md` on every
edit** — much in-flight work is exploratory or wrong, and churning docs on each change is noise.
Refresh the affected docs only when a change is real and about to land, as part of preparing the
commit (then `bun run lint`). Keep them lean: record project-specific decisions, constraints, and
gotchas — omit anything an agent already knows. The *content* rule — why-not-what, never restate the
code surface — is `.claude/rules/claude-md.md`.

## Vendored repositories

`repos/effect-smol/` holds the **Effect v4 beta source** as read-only reference material so
coding agents read real patterns instead of guessing. **Never import from `repos/` in
application code; never edit it.** When unsure of an Effect API, verify there or in
`.claude/agent-patterns/*.md` instead of guessing. Full rules: `.claude/rules/vendored-sources.md`.
Update via `bun run vendor:effect:update`.

## Slash commands

`/check` (lint+tsc+test) · `/scan-deps` (verify layer rule) · `/new-package` (scaffold a workspace) ·
`/sweep` (on-demand design+platform sweep over recent changes — expensive by design, run it deliberately).

**SDD toolkit** — `/sdd:{research,specify,clarify,plan,tasks,implement,verify}` drive the
spec-driven loop (research → spec → plan → kanban tasks → TDD implement → fresh-context verify),
reading/writing the live feature in Notion. They are **compiled from** the
[SDD playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) §6/§7/§8 (the authored
source — edit it, then regenerate the command) and `@`-reference the shared contract bundle in
`.claude/sdd/`. Quickstart: `.claude/commands/README.md`. Conventions: `.claude/rules/sdd.md`.
