---
description: Scaffold a new @lexiai/<name> workspace in the correct layer
argument-hint: <layer>/<name>  e.g. packages/metrics or core/reviews
---

Scaffold a new workspace at `$ARGUMENTS`, following the existing conventions.

Steps:
1. **Validate the layer.** The target must be under `apps/`, `core/`, `repositories/`, `packages/`, `database`, or `infra`. Reject anything else. Confirm the intended dependencies respect `@.claude/rules/dependency-hierarchy.md` (downward only; `packages/*` are leaves; `apps/web` may only use schemas+http).
2. **package.json** — `"name": "@lexiai/<flattened-name>"` (nested folders flatten with a dash, see `@.claude/rules/naming.md`), `"version": "0.0.0"`, `"private": true`, `main`/`types`/`exports` → `./src/index.ts`. Add deps via `catalog:<group>` (externals) and `workspace:*` (internal), only those the layer is allowed to use. **Scripts must include `"typecheck": "tsc --noEmit"`** (run by root `bun run tsc` = `bun run --filter '*' typecheck`) **and `"test": "vitest run"`** (run by root `bun run test` = `bun run --filter '*' test`). Both root aggregators enumerate workspaces via Bun filters, so a missing script silently drops the package from that gate.
3. **tsconfig.json** — `extends` the root `tsconfig.base.json`, `compilerOptions.outDir: "dist"`, `include: ["src/**/*", "index.ts"]`. **No `references`** — packages resolve each other's source via `workspace:*` + `moduleResolution: bundler` (F-PLAT-002/T02), so project references are neither needed nor used.
4. **vitest.config.ts** — one line re-exporting the shared config: `export { default } from '<rel>/vitest.base.ts'` (`<rel>` = `../..` for `packages/<x>`, `..` for a top-level workspace like `database`). This is what makes the package run as its own Vitest process under `bun run --filter '*' test` (F-PLAT-002/T01); a single aggregate `vitest run` is not used because it drops projects on this toolchain. A frontend package that needs the Vite/React pipeline for UI tests can `mergeConfig` its `vite.config.ts` with the shared config instead — but plain unit tests should stay on the node config.
5. **src/index.ts** — `export {}` placeholder.
6. **src/smoke.test.ts** — `import { expect, it } from '@effect/vitest'` + a trivial passing test.
7. **CLAUDE.md** — one short paragraph: role + who may import it + import boundaries.
8. **No root-config edit needed** — do **not** hand-list the package anywhere. The single source of truth is `package.json#workspaces`: `bun run tsc` and `bun run test` both enumerate workspaces via `--filter '*'`, so a folder matching an existing `workspaces` glob is picked up automatically (F-PLAT-002). Just confirm it matches.
9. Run `bun install`, then `bun run check` and `bun run --filter '@lexiai/<name>' test`. Report results.
