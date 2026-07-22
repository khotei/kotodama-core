# Tooling

| Command | Runs | Gates |
|---|---|---|
| `bun run bootstrap` | `bun install` | — |
| `bun run format` | `biome format --write .` | local only |
| `bun run lint` | `biome lint .` | pre-commit + CI |
| `bun run tsc` | `bun run --filter '*' typecheck` (each workspace's `bun --bun tsc --noEmit`) | pre-commit + CI |
| `bun run test` | `bun run --filter '*' test` (each workspace's own `bun --bun vitest run`) | CI only |
| `bun run check` | `lint` + `tsc` | manual / `/check` |

**Shared config presets** live in the `@kotodama/tooling` workspace (`.tooling/` — dot-hidden: write-once config, not day-to-day code):
`tsconfig.base.json`, `vitest.base.ts`, and the Biome config `biome.base.json` (2-space, single
quotes, semicolons as-needed, width 100). **There is no config file in the repo root at all.**

- **tsconfig / vitest** reach the presets by **package specifier** (`@kotodama/tooling/…`), so every
  workspace carries `@kotodama/tooling` as a `workspace:*` devDependency (depth-independent — no
  `../` juggling). `@kotodama/tooling` is config-only: no `typecheck`/`test` scripts, so the
  `--filter '*'` gates skip it.
- **Biome** cannot use a package specifier, and its config is NOT at the root. Two deliberate moves
  make a root-less Biome work: (1) the file is named `biome.base.json`, **not** `biome.json`, so
  Biome's auto-discovery never picks it up as a stray nested config on a full-tree scan; (2) every
  Biome invocation passes `--config-path .tooling/biome.base.json` (the two root scripts +
  the husky hook), and the file is `"root": true`. The layer rule is encoded via
  `style/noRestrictedImports` per-**folder**-glob overrides in it (one per layer folder —
  `database/**`, `core/repositories/**`, `core/words|content/**`, `core/use-cases/**`,
  `platform/**` — banning the upward `@kotodama/core/*` subpath specifiers) — the sole enforcement of
  the dependency hierarchy (transitive-import checking is out of scope; if ever needed, add
  `scripts/check-deps.ts` and note it here).
  - **Trade-offs of the root-less Biome (chosen: clean root > these costs):** `--config-path`
    **disables Biome's standard config resolution**, so a bare `biome …` typed without the flag
    finds no config — always go through `bun run lint`/`format`. The editor/LSP Biome does not work
    (it only auto-discovers a root `biome.json`; this repo edits via Claude, not in-editor Biome).
    Biome is **reworking project-root resolution** ([biomejs/biome#8672]; `--config-path`+root
    interplay is rough, [#7390]) — **re-verify `bun run lint` on any Biome version bump**; if it
    breaks, the fallback is a 3-line root `biome.json` stub that `extends`
    `@kotodama/tooling/biome.base.json`.

[biomejs/biome#8672]: https://github.com/biomejs/biome/issues/8672
[#7390]: https://github.com/biomejs/biome/issues/7390

**Husky pre-commit:** `biome check --staged` + `bun run tsc`. Tests don't run on commit (too slow —
CI only). `git commit --no-verify` bypasses it — genuine emergencies only, never on `main`. Husky
(not Lefthook/lint-staged) is named by Tech spec §2.1 — don't swap without updating the spec.

## Single source of truth: `package.json#workspaces`

The workspace list is `["apps/*","core","database","platform","infra",".tooling"]` — `core` and `platform` are
each **one aggregate package** whose layer/adapter folders are subpath exports, not separate
workspaces. **The package list lives in exactly one place. There is no root `tsconfig.json` and no
root `vitest.config.ts` — never reintroduce one to hand-list packages.**

- Each workspace's single `tsconfig.json` extends `@kotodama/tooling/tsconfig.base.json` and covers
  all of that package's layer folders; packages resolve each other's **source** via `workspace:*` +
  `moduleResolution: bundler`, so per-workspace `tsc --noEmit` is correct without project references
  (`composite`/`declaration` were removed — they only served the retired `tsc -b` mode). Bare
  `tsc`/`vitest` from the repo root is not a supported entrypoint.
- Each workspace owns a one-line `vitest.config.ts` re-exporting `@kotodama/tooling/vitest.base`
  (node env + `test/**/*.test.ts`). **`core` runs ONE vitest over `**/test/**` across all its layer
  folders** (`database`, `repositories`, `words`, `content`, `use-cases`) — a single project over
  many test files, which is fine.
- **A single aggregate `vitest run` spanning multiple workspace projects is banned:** on Bun 1.3.10
  + Vitest 3.2.4 such multi-project aggregation silently runs only a subset of projects **and exits 0
  on failures** (verified with filesystem markers; the defect is Vitest's multi-project aggregation,
  not our config). Per-workspace runs give correct exit codes — and one package's single config over
  many test files (as `core` does) is not multi-project, so it is unaffected.
- Adding/renaming a workspace requires zero root-config edits — `/new-package` emits the
  per-package scripts and config.

## Every script runs under Bun (`--bun`), never node

`node` is **not** a dependency of this repo — the runtime is Bun. But the CLI bins these scripts
call (`tsc`, `vitest`, `drizzle-kit`) ship a `#!/usr/bin/env node` shebang, so a bare
`tsc --noEmit` / `vitest run` dies with `env: node: No such file` on a node-less machine — and on
one that *does* have node, `vitest` would run under Node and its `import 'bun'`
(`@effect/platform-bun`) fails with `Cannot find package 'bun'`. So **every per-package script
prefixes the bin with `bun --bun`** (`bun --bun tsc --noEmit`, `bun --bun vitest run`,
`bun --bun drizzle-kit …`) — the same forcing already used for `bun --bun vite`. The flag lives in
the **package** script, not the root aggregator, so a standalone
`bun run --filter '@kotodama/<name>' {typecheck,test}` is forced onto Bun too.

`bun test` invokes Bun's built-in runner and ignores the `test` script — always `bun run test`.
