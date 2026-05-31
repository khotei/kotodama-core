# Testing

- **Runner:** `@effect/vitest` (Effect-aware `it`/`expect`). Import test helpers from `@effect/vitest`, **not** `vitest`.
- **Run all:** `bun run test` (NOT `bun test` — that's Bun's built-in runner). It expands to `bun run --filter '*' test`: each workspace runs its own plain `vitest run` in its own directory and Bun aggregates the exit codes. A single aggregate `vitest run` over all projects is **not** used — on Bun 1.3.10 + Vitest 3.2.4 it silently runs only ~9/16 projects and exits 0 even on failures (verified with filesystem markers; see `@.claude/rules/tooling.md`). **Per package:** `bun run --filter '@lexiai/<name>' test`.
- **Config:** each workspace has a one-line `vitest.config.ts` re-exporting the root `vitest.base.ts` (node env + `src/**/*.test.ts`); there is **no** central project list. The package set is the single source of truth `package.json#workspaces`, enumerated by `bun run --filter '*'`. Never hand-list packages anywhere. `apps/web` deliberately uses the shared **node** config (not its `vite.config.ts`) for unit tests, so the React/Vite pipeline isn't loaded for plain tests.
- **Files:** `*.test.ts`, colocated under each workspace's `src/`. Every workspace has at least a smoke test.
- **Not in pre-commit:** tests run in CI (T12) and locally on demand, never on `git commit`.

## Test database (per Tech spec §18)

- Tests that touch the DB use `.env.test` → a **separate** database (`lexiai_test`), never the dev DB.
- Reset state between tests (e.g. `DrizzleMigration.reset()` / truncate) so tests are isolated and order-independent.
- Local infra: `bun run --filter '@lexiai/infra' local:up` brings up Postgres (`lexiai_dev` + `lexiai_test`) and LocalStack.

## Effect tests

For Effect code, prefer `@effect/vitest`'s `it.effect` / `it.scoped` to run `Effect`s with proper resource management. See `repos/effect-smol/packages/effect/test` for idiomatic examples and `.claude/agent-patterns/effect-context-and-layer.md` for fixture patterns.
