# Testing

- **Runner:** `@effect/vitest` (Effect-aware `it`/`expect`). Import test helpers from `@effect/vitest`, **not** `vitest`.
- **Run all:** `bun run test` (NOT `bun test` — that's Bun's built-in runner). It expands to `bun run --filter '*' test`: each workspace runs its own plain `vitest run` in its own directory and Bun aggregates the exit codes. A single aggregate `vitest run` over all projects is **not** used — on Bun 1.3.10 + Vitest 3.2.4 it silently runs only ~9/16 projects and exits 0 even on failures (verified with filesystem markers; see `@.claude/rules/tooling.md`). **Per package:** `bun run --filter '@lexiai/<name>' test`.
- **Config:** each workspace has a one-line `vitest.config.ts` re-exporting the root `vitest.base.ts` (node env + `test/**/*.test.ts`); there is **no** central project list. The package set is the single source of truth `package.json#workspaces`, enumerated by `bun run --filter '*'`. Never hand-list packages anywhere. `apps/web` deliberately uses the shared **node** config (not its `vite.config.ts`) for unit tests, so the React/Vite pipeline isn't loaded for plain tests.
- **Files:** `*.test.ts` in each workspace's **`test/`** folder (sibling of `src/`, mirroring its structure) — kept separate from source, matching the vendored effect-smol/drizzle layout. Every workspace has at least a smoke test. Tests import the package's own modules via `../src/…` (or the package's public subpath export). The `test/` folder is in each workspace's tsconfig `include`, so `tsc` typechecks tests too.
- **Not in pre-commit:** tests run in CI (T12) and locally on demand, never on `git commit`.

## Test database (per Tech spec §18)

- Tests that touch the DB run against an **ephemeral Postgres started by Testcontainers** (`@testcontainers/postgresql`), never the dev DB or any shared/long-lived DB. The connection URL is **generated per container**, so a test run *structurally cannot* hit the dev DB — there is **no `.env.test`** and no test-mode config precedence. Requires a **Docker daemon** (local + CI). Mirrors Effect's own pg tests (`repos/effect-smol/packages/sql/pg/test/utils.ts`).
- The test surface is **`@lexiai/database/testing`** (`database/src/testing.ts`): **`TestDatabaseLive`** — a `DB` layer over a fresh container with **migrations applied at layer build** (programmatic `migrate` from `drizzle-orm/effect-postgres/migrator`, reading the rc folder format). The **suite migrates itself** — no out-of-band `db:migrate`, no manual step to forget.
- Isolate state with the shared **`resetDb`** helper (same file) — an **Effect that consumes `DB`**. It `TRUNCATE`s **every** `public` table (`RESTART IDENTITY CASCADE`, enumerated dynamically from `pg_tables` — new tables need no per-table list; the migration record in the `drizzle` schema is untouched). Use **one container per test file** via `it.layer(TestDatabaseLive)` and call `resetDb` at the **start of each test**:
  ```ts
  it.layer(TestDatabaseLive, { timeout: '120 seconds' })((it) => {
    it.effect('…', () => Effect.gen(function* () {
      yield* resetDb
      const db = yield* DB
      // …
    }))
  })
  ```
  Reset runs **in-test**, not in an `afterEach`: the `it.layer` container is shared across the file, so a hook providing its own layer would spin up a **second container**. The build timeout covers a first-time image pull.
- Local infra (`bun run --filter '@lexiai/infra' local:up`) brings up the **dev** Postgres (`lexiai_dev`) + LocalStack; it does **not** provision a test DB — Testcontainers owns that.

## Effect tests

For Effect code, prefer `@effect/vitest`'s `it.effect` / `it.scoped` to run `Effect`s with proper resource management. See `repos/effect-smol/packages/effect/test` for idiomatic examples and `.claude/agent-patterns/effect-context-and-layer.md` for fixture patterns.
