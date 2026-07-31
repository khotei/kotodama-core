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

**A new domain is a folder in its aggregate, never a new package.** `database` single-authors the
word vocabulary (`database/CLAUDE.md`), so every tier takes a **direct downward edge to `database`**
— no cycle. Enforcement: the Biome `noRestrictedImports` per-folder globs in `biome.base.json` are
the **sole** gate (`bun run lint` verifies).

## Conventions & commands

Gate, root scripts, and the `bun --bun`/`bun test` traps: `.claude/rules/tooling.md`; commits:
`commits.md`; PRs: `pull-requests.md`. Conventions live in `.claude/rules/` — always-loaded
cross-cutting vs `paths:`-scoped (load on match); on-demand depth in `.claude/agent-patterns/*`
(pointer-loaded, never in `rules/`). Each subtree carries its own `CLAUDE.md` (loads on touch;
ancestors always load).

## Slash commands

`/new-package`. **SDD toolkit** —
`/sdd:{research,specify,clarify,plan,tasks,implement,verify}` drive the spec-driven loop against the
live Notion feature, compiled from the
[playbook](https://www.notion.so/36dfb28bd5f181238a86d26457bc24e7) §6/§7/§8. Quickstart:
`.claude/commands/README.md`. Conventions: `.claude/rules/sdd.md`.
