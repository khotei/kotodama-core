# Tooling

| Command | Runs | Gates |
|---|---|---|
| `bun run bootstrap` | `bun install` | — |
| `bun run format` | `biome format --write .` | local only |
| `bun run lint` | `biome lint .` | pre-commit + CI |
| `bun run tsc` | `bun run --filter '*' typecheck` (each workspace's `tsc --noEmit`) | pre-commit + CI |
| `bun run test` | `bun run --filter '*' test` (each workspace's own `vitest run`) | CI only |
| `bun run check` | `lint` + `tsc` | manual / `/check` |

## Biome (lint + format)

Single root `biome.json`. 2-space, single quotes, semicolons as-needed, trailing commas all, width 100. Encodes the layer rule via `style/noRestrictedImports` per-glob overrides. `vcs.useIgnoreFile` keeps `node_modules`, `dist`, and `repos/` out.

## Husky (pre-commit)

`.husky/pre-commit` runs `biome check --staged` then `bun run tsc` (the Bun-filter typecheck — each workspace's `tsc --noEmit`). Tests do **not** run on commit (too slow) — CI only.

> Pre-F-PLAT-002 the hook ran `tsc -b`, which relied on the root solution `references`. T02 removed that list (TS has no glob for references — microsoft/TypeScript#56279), so `tsc -b` would have typechecked nothing. Packages resolve each other's **source** via `workspace:*` + `moduleResolution: bundler`, so `tsc --noEmit` per workspace is correct without references.

## Single source of truth: `package.json#workspaces` (F-PLAT-002)

**The package list lives in exactly one place — `package.json#workspaces`. There is no root `tsconfig.json` or root `vitest.config.ts`; never reintroduce one to hand-list packages.**

- **Vitest:** each workspace owns a one-line `vitest.config.ts` re-exporting the root `vitest.base.ts` (node env + `test/**/*.test.ts` — tests live in a `test/` folder, sibling of `src/`). There is **no** root `vitest.config.ts`. `bun run test` = `bun run --filter '*' test`, so each workspace runs its own plain `vitest run` in its own directory and Bun aggregates exit codes. A single aggregate `vitest run` over all `projects` is **not** used: on Bun 1.3.10 + Vitest 3.2.4 it silently runs only ~9/16 projects **and exits 0 even on failures** (verified with filesystem markers — true for the glob list, an explicit list, and all `--project` flags, so the defect is Vitest's multi-project aggregation, not our config). Per-workspace runs give correct exit codes, mirroring `tsc`. `apps/web` uses the shared **node** config for unit tests rather than its `vite.config.ts`, so the React/Vite pipeline isn't loaded for plain tests.
- **TypeScript:** there is **no** root `tsconfig.json` — each workspace's `tsconfig.json` extends `tsconfig.base.json` directly. `bun run tsc` = `bun run --filter '*' typecheck` enumerates workspaces natively; each carries `"typecheck": "tsc --noEmit"`. (A root `tsconfig.json` would only have been needed for `tsc -b` solution-mode references, which are gone — running bare `tsc`/`vitest` from the repo root is not a supported entrypoint.)
- **Adding/renaming/moving a workspace requires zero root-config edits.** `/new-package` emits the per-package `typecheck` script, the `test` script, and the one-line `vitest.config.ts`; nothing registers the package centrally.
- **`composite`/`declaration` were removed from `tsconfig.base.json`** — they only existed to enable build-mode references, which are gone.

Escape hatch: `git commit --no-verify` bypasses the hook. Use only for genuine emergencies (e.g. a WIP commit on a throwaway branch), never on `main`.

## Decision: why Husky, not Lefthook/lint-staged

Tech spec §2.1 names "Biome + Husky + `@effect/vitest`". Husky is the simplest hook manager that does exactly what we need (a shell script gate). No multi-tool config, no extra binary. Do not swap without updating the spec and recording the decision here.

## Decision: layer enforcement via Biome, not a custom script

Biome `noRestrictedImports` expresses the direct-import layer graph cleanly (per-glob `group` patterns with `!` negation for the FE allowlist). Transitive-import enforcement is out of scope for Biome; if a future task needs it, add `scripts/check-deps.ts` and wire it into `lint`/`/scan-deps`, then note it here.

## Tests: `bun test` vs `bun run test`

`bun test` invokes **Bun's built-in** runner (ignores the `test` script). Use **`bun run test`** for `@effect/vitest`. Per-package: `bun run --filter <name> test`.
