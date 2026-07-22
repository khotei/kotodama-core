---
description: Scaffold a new @kotodama/<name> workspace in the correct layer
argument-hint: <layer>/<name>  e.g. apps/admin (a new top-level workspace)
---

Scaffold a new workspace at `$ARGUMENTS`, following the existing conventions.

Steps:
1. **Validate the target.** New **workspaces** are top-level: `apps/<name>` (or a rare new top-level package). A new **layer folder** inside `core`/`platform` is NOT a new workspace — it is a **subpath export** of that existing aggregate package: add it to the package's `exports` + Biome layer glob, don't scaffold a workspace. Reject anything else. Confirm the intended dependencies respect `@.claude/rules/dependency-hierarchy.md` (downward only; `platform/*` are leaves).
2. **package.json** — `"name": "@kotodama/<name>"` (apps drop the plural → `@kotodama/app-<name>`, see `@.claude/rules/naming.md`), `"version": "0.0.0"`, `"private": true`, `main`/`types`/`exports` → `./src/index.ts`. Add deps via `catalog:<group>` (externals) and `workspace:*` (internal), only those the layer is allowed to use. **Always add `"@kotodama/tooling": "workspace:*"` to `devDependencies`** — it supplies the shared tsconfig/vitest/biome presets consumed by specifier (below); after scaffolding run `bun install` so the workspace symlink is created. **Scripts must include `"typecheck": "bun --bun tsc --noEmit"`** (run by root `bun run tsc` = `bun run --filter '*' typecheck`) **and `"test": "bun --bun vitest run"`** (run by root `bun run test` = `bun run --filter '*' test`). Both root aggregators enumerate workspaces via Bun filters, so a missing script silently drops the package from that gate. The **`bun --bun` prefix is required** — the `tsc`/`vitest` bins carry a `#!/usr/bin/env node` shebang, so a bare form breaks on a node-less machine (see `.claude/rules/tooling.md`).
3. **tsconfig.json** — `extends` the shared preset by specifier: `"@kotodama/tooling/tsconfig.base.json"` (depth-independent — no `../` juggling), `compilerOptions.outDir: "dist"`, `include: ["src/**/*", "test/**/*", "index.ts", "*.config.ts"]` (the `test/**/*` entry so `tsc` typechecks tests). **No `references`** — packages resolve each other's source via `workspace:*` + `moduleResolution: bundler` (F-PLAT-002/T02), so project references are neither needed nor used.
4. **vitest.config.ts** — one line re-exporting the shared config: `export { default } from '@kotodama/tooling/vitest.base'`. This is what makes the package run as its own Vitest process under `bun run --filter '*' test` (F-PLAT-002/T01); a single aggregate `vitest run` is not used because it drops projects on this toolchain.
5. **src/index.ts** — `export {}` placeholder.
6. **test/smoke.test.ts** — `import { expect, it } from '@effect/vitest'` + a trivial passing test (tests live in `test/`, not `src/` — see `@.claude/rules/testing.md`).
7. **CLAUDE.md** — one short paragraph: role + who may import it + import boundaries.
8. **No root-config edit needed** — do **not** hand-list the package anywhere. The single source of truth is `package.json#workspaces`: `bun run tsc` and `bun run test` both enumerate workspaces via `--filter '*'`, so a folder matching an existing `workspaces` glob is picked up automatically (F-PLAT-002). Just confirm it matches.
9. Run `bun install`, then `bun run check` and `bun run --filter '@kotodama/<name>' test`. Report results.
