# Tooling

| Command | Runs | Gates |
|---|---|---|
| `bun run bootstrap` | `bun install` | — |
| `bun run format` | `biome format --write .` | local only |
| `bun run lint` | `biome lint .` | pre-commit + CI |
| `bun run tsc` | `bun run --filter '*' typecheck` (each workspace's `bun --bun tsc --noEmit`) | pre-commit + CI |
| `bun run test` | `bun run --filter '*' test` (each workspace's own `bun --bun vitest run`) | CI only |
| `bun run check` | `lint` + `tsc` | manual / `/check` |

**Biome:** single root `biome.json` (2-space, single quotes, semicolons as-needed, width 100).
Encodes the layer rule via `style/noRestrictedImports` per-glob overrides — the only enforcement of
the dependency hierarchy (transitive-import checking is deliberately out of scope; if ever needed,
add `scripts/check-deps.ts` and note it here).

**Husky pre-commit:** `biome check --staged` + `bun run tsc`. Tests don't run on commit (too slow —
CI only). `git commit --no-verify` bypasses it — genuine emergencies only, never on `main`. Husky
(not Lefthook/lint-staged) is named by Tech spec §2.1 — don't swap without updating the spec.

## Single source of truth: `package.json#workspaces`

**The package list lives in exactly one place. There is no root `tsconfig.json` and no root
`vitest.config.ts` — never reintroduce one to hand-list packages.**

- Each workspace's `tsconfig.json` extends `tsconfig.base.json` directly; packages resolve each
  other's **source** via `workspace:*` + `moduleResolution: bundler`, so per-workspace
  `tsc --noEmit` is correct without project references (`composite`/`declaration` were removed —
  they only served the retired `tsc -b` mode). Bare `tsc`/`vitest` from the repo root is not a
  supported entrypoint.
- Each workspace owns a one-line `vitest.config.ts` re-exporting the root `vitest.base.ts` (node
  env + `test/**/*.test.ts`).
- **A single aggregate `vitest run` over all projects is banned:** on Bun 1.3.10 + Vitest 3.2.4 it
  silently runs only ~9/16 projects **and exits 0 on failures** (verified with filesystem markers;
  the defect is Vitest's multi-project aggregation, not our config). Per-workspace runs give
  correct exit codes.
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
`bun run --filter '@lexiai/<name>' {typecheck,test}` is forced onto Bun too.

`bun test` invokes Bun's built-in runner and ignores the `test` script — always `bun run test`.
