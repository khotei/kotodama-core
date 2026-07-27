# Kotodama — Claude Code project context

Kotodama is a language-learning platform: users request words, AI background jobs generate rich
entries (definitions, examples, images), surfaced through spaced-repetition review. **This repo is
the foundational Bun monorepo scaffolding** — strict layering so later features ship cheaply.
Product/architecture detail: the [Tech spec](https://www.notion.so/36dfb28bd5f181988f16de6ab423eb3e).
This file + the auto-loaded `.claude/rules/` are the working context.

## Runtime

**Bun 1.3** (pinned via `packageManager`, runs `.ts` directly) · **TypeScript strict** — prefer
type-fest over a hand-rolled mapped/conditional type · **Effect v4 (beta)** —
`Context.Service`/`Context.Tag`, in-beta APIs under `effect/unstable/*`; **pinned EXACT
`4.0.0-beta.78`, never the floating `beta` tag** (a new effect edge once re-resolved it to a fresh
beta, skewing versions monorepo-wide and breaking `tsc`).

## Dependency hierarchy

```
apps/{api,worker} ─► core/use-cases ─► core/{words,content} ─► core/repositories ─► database
                                            ▼
                                    platform/{ai,queue,storage,config,external-apis,observability}
                                    (everything → @kotodama/platform, platform → nothing internal)
```

Middle tiers are subpath-exported folders of the single `@kotodama/core`; `database` is its own
bottom workspace (distinct drizzle/migration tooling); `platform/*` are folders of the single leaf
`@kotodama/platform`. `core/use-cases` is the top tier below `apps/*` — user-flow composers
(`requestWordBuild`, `buildWord`) that aggregate domain + repo functions into one flow. **A new
domain is a folder in its aggregate, never a new package.** `database` single-authors the word
vocabulary (content schemas, value tuples/`pgEnum`s, `WordEntity`), so every tier takes a **direct
downward edge to `database`** — no cycle. Enforcement: Biome `noRestrictedImports` per-folder globs
in `biome.base.json` are the sole gate (`bun run lint` verifies; application code also never
imports from `repos/**` — effect-conventions.md).

## Commands & gate

Root scripts (`bootstrap`/`format`/`lint`/`tsc`/`test`/`check`, `vendor:*:update`, per-package
`--filter`) live in `package.json`; the command table, gates, and the `bun --bun`/`bun test` traps:
`.claude/rules/tooling.md`. Every commit follows `.claude/rules/commits.md`; PRs squash-merge into
one such commit (`.claude/rules/pull-requests.md`).

## Rules (`.claude/rules/`)

Auto-discovered; **always-loaded** cross-cutting rules vs **path-scoped** (`paths:` frontmatter,
load on match) keep the always-on context lean. On-demand depth lives in `.claude/agent-patterns/*`
(pointer-loaded, never in `rules/`).

- **Always:** `naming` · `comments` · `tooling` · `commits` · `pull-requests` · `claude-md`.
- **Path-scoped:** `effect-conventions`, `vendored-sources` → `**/*.ts` · `drizzle-effect` → `database/**`, `core/repositories/**` · `testing` → `**/test/**`, `**/*.test.ts` · `sdd` → `.claude/{commands,agents,sdd}/**`.

## Per-layer context

One `CLAUDE.md` per subtree (`apps/{api,worker}`, `core/use-cases`, `core/{words,content}`,
`database`, `core/repositories/words`, `platform/*`, `infra`) — loads when you touch that folder;
ancestors (this file) always load.

## Slash commands

`/new-package`. **SDD toolkit** —
`/sdd:{research,specify,clarify,plan,tasks,implement,verify}` drive the spec-driven loop against the
live Notion feature, compiled from the
[playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) §6/§7/§8. Quickstart:
`.claude/commands/README.md`. Conventions: `.claude/rules/sdd.md`.
