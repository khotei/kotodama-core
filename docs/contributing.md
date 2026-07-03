# Contributing

*Diátaxis: how-to.* How to work in this repo. Every convention has an authoritative home in
[`.claude/rules/`](../.claude/rules/) (auto-loaded in Claude Code) — this page is the index, not a
restatement.

## Scripts

Run from the repo root; per-package via `bun run --filter '@kotodama/<name>' <script>`.

| Script | Does | Source |
|---|---|---|
| `bun install` (`bun run bootstrap`) | install deps | — |
| `bun run format` | Biome format + autofix | [`tooling.md`](../.claude/rules/tooling.md) |
| `bun run lint` | Biome lint (incl. the layer-import rule) | [`tooling.md`](../.claude/rules/tooling.md) |
| `bun run tsc` | typecheck every workspace | [`tooling.md`](../.claude/rules/tooling.md) |
| `bun run check` | `lint` + `tsc` | [`tooling.md`](../.claude/rules/tooling.md) |
| `bun run test` | `@effect/vitest` per workspace (needs Docker; **not** `bun test`) | [`testing.md`](../.claude/rules/testing.md) · [running](running.md#test) |

The package list is single-sourced from `package.json#workspaces` — there is no root `tsconfig.json`
or `vitest.config.ts`. Why, and the per-workspace config shape:
[`tooling.md`](../.claude/rules/tooling.md).

## The pre-commit gate

A **Husky** hook runs `biome check --staged` + `bun run tsc` and blocks bad commits (tests are
CI-only — too slow). Emergency bypass `git commit --no-verify`, never on `main`. Details:
[`tooling.md`](../.claude/rules/tooling.md).

## Commits

`<gitmoji> <type>(<scope>): <subject>` + a decision-rich body + a `Refs:` footer, so `git log -p`
reconstructs context. The full format, gitmoji table, and worked examples:
[`commits.md`](../.claude/rules/commits.md).

## Pull requests

PRs **squash-merge** into one commit whose subject is the PR title and body is the PR description
(HTML comments stripped) — so the description *is* the permanent history. Fill in
[`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md); the format mirrors
`commits.md`. Full rule + the repo's required squash setting:
[`pull-requests.md`](../.claude/rules/pull-requests.md).

## Adding a workspace

Use the `/new-package` Claude Code command — it scaffolds `package.json`, `tsconfig`, `src`, a smoke
test, the one-line `vitest.config.ts`, and a `CLAUDE.md` in the correct layer, with **zero** root-config
edits. Naming (`@kotodama/<folder>`, file roles): [`naming.md`](../.claude/rules/naming.md). Where it may
sit in the layer graph: [`dependency-hierarchy.md`](../.claude/rules/dependency-hierarchy.md).

## Working with Effect & Drizzle

The Effect v4 beta source is vendored read-only under `repos/effect-smol/` (Drizzle under
`repos/drizzle/`) so you read real patterns instead of guessing — **never import from `repos/`**.
Cheat-sheets in [`.claude/agent-patterns/`](../.claude/agent-patterns/); the rules:
[`effect-conventions.md`](../.claude/rules/effect-conventions.md) ·
[`vendored-sources.md`](../.claude/rules/vendored-sources.md). Update with `bun run vendor:effect:update`.

## Editor setup

Point your IDE at the **workspace** TypeScript (`node_modules/typescript`) to load the Effect language
service, and exclude `repos/**` from indexing. Per-editor steps:
[`vendored-sources.md`](../.claude/rules/vendored-sources.md).

## Docs

Editing `readme.md` or `docs/**`? They follow [`human-docs.md`](../.claude/rules/human-docs.md):
why-not-what, commands via scripts, link don't restate — and a CI dead-link check guards the links.
