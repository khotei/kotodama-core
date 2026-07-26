# Tooling

| Command | Runs | Gate |
|---|---|---|
| `bun run lint` | `biome lint .` | pre-commit + CI |
| `bun run tsc` | `bun run --filter '*' typecheck` (per-workspace `bun --bun tsc --noEmit`) | pre-commit + CI |
| `bun run test` | `bun run --filter '*' test` (per-workspace `bun --bun vitest run`) | CI only |
| `bun run check` | `lint` + `tsc` | manual / `/check` |
| `bun run format` | `biome format --write .` | local only |

## Root-less config — the whole design

Shared presets live in `@kotodama/presets` (`infra/presets/`); **there is no config file in the repo
root at all**. tsconfig/vitest reach presets by package specifier (`@kotodama/presets/…`, a
`workspace:*` devDep — depth-independent).

**Biome cannot use a package specifier, so:** the file is named **`biome.base.json`** (not
`biome.json`, so auto-discovery ignores it), is `"root": true`, and **every** invocation passes
`--config-path infra/presets/src/biome.base.json` (both root scripts + husky). Consequence: a bare
`biome …` finds no config and the editor LSP can't discover it — **always go through
`bun run lint`/`format`**. Re-verify `bun run lint` on any Biome version bump; fallback is a 3-line
root `biome.json` stub that `extends` the preset.

Husky pre-commit: `biome check --staged` + `bun run tsc` (tests are CI-only). `--no-verify` for
genuine emergencies, never on `main`.

## Workspaces & vitest

`package.json#workspaces` is the single package list — **no root `tsconfig.json`/`vitest.config.ts`;
never reintroduce one to hand-list packages**. Per-workspace `tsc --noEmit` is correct via
`workspace:*` + `moduleResolution: bundler` (no project references).

**A single aggregate `vitest run` spanning multiple workspace projects is BANNED:** on Bun 1.3.10 +
Vitest 3.2.4 it silently runs only a subset **and exits 0 on failure**. Per-workspace runs give
correct exit codes. `core` running ONE vitest over `**/test/**` across its own layer folders is a
single project, not multi-project — unaffected.

## Every script runs `bun --bun`, never node

`node` is not a dependency, but `tsc`/`vitest`/`drizzle-kit` ship a `#!/usr/bin/env node` shebang —
so **every per-package script prefixes `bun --bun`** (also: `vitest` under real Node fails on
`@effect/platform-bun`'s `import 'bun'`). The flag lives in the package script, not the aggregator.
**`bun test` ≠ `bun run test`** — `bun test` runs Bun's built-in runner and ignores the `test` script.
