---
paths:
  - "**/test/**"
  - "**/*.test.ts"
  - "**/vitest.*.ts"
---

# Testing

- **Runner:** `@effect/vitest` (Effect-aware `it`/`expect`). Import test helpers from `@effect/vitest`, **not** `vitest`.
- **Run all:** `bun run test` (NOT `bun test` — that's Bun's built-in runner). It expands to `bun --bun run --filter '*' test`: each workspace runs its own plain `vitest run` in its own directory and Bun aggregates the exit codes. The **`--bun`** forces vitest onto the Bun runtime — required because some tests load `@effect/platform-bun` (`import 'bun'`); without it, a runner with `node` on `PATH` (CI) hands vitest to Node and the import fails. See `.claude/rules/tooling.md` (the `bun --bun run` decision). A single aggregate `vitest run` over all projects is **not** used — on Bun 1.3.10 + Vitest 3.2.4 it silently runs only ~9/16 projects and exits 0 even on failures (verified with filesystem markers). **Per package:** `bun run --filter '@lexiai/<name>' test`.
- **Config:** each workspace has a one-line `vitest.config.ts` re-exporting the root `vitest.base.ts` (node env + `test/**/*.test.ts`); there is **no** central project list. The package set is the single source of truth `package.json#workspaces`, enumerated by `bun run --filter '*'`. Never hand-list packages anywhere. `apps/web` deliberately uses the shared **node** config (not its `vite.config.ts`) for unit tests, so the React/Vite pipeline isn't loaded for plain tests.
- **Files:** `*.test.ts` in each workspace's **`test/`** folder (sibling of `src/`, mirroring its structure) — kept separate from source, matching the vendored effect-smol/drizzle layout. Every workspace has at least a smoke test. Tests import the package's own modules via `../src/…` (or the package's public subpath export). The `test/` folder is in each workspace's tsconfig `include`, so `tsc` typechecks tests too.
- **Not in pre-commit:** tests run in CI (T12) and locally on demand, never on `git commit`.

## Organizing a test file (structure · naming · reuse)

Reuse model is **DAMP over DRY**: keep each test's Arrange visible; dedupe with *called helpers*,
never lifecycle hooks. Three levels:

1. **File = one `it.layer(TestLayer, { timeout })`** — one container, shared. `resetDb` / `drainQueue`
   stay **inline** at the top of each test (a hook would build a second container — see above).
2. **Reuse = composable `Effect` helpers on a `<pkg>/testing` subpath**, not `beforeEach`
   (`@effect/vitest` exposes no layer-aware hook — the layer's services exist only inside `it.effect`,
   so a plain `beforeEach` can't `yield*` them). Scenario seeds live at the layer that **owns the
   table**: `seedReadyWord` (`@lexiai/repositories-words/testing`); `PENDING_ALL` /
   `seedPendingPipeline` / `seedRunningStage` / `seedFailedWord`
   (`@lexiai/repositories-async-word-jobs/testing`); state narrowing `assertStatus` (a local helper in
   `apps/api/test/words-api-test-utils.ts`, next to the `WordStateView` it narrows). Test-data builders stay
   `@lexiai/database/factories`.
3. **Test = `describe` + `it.effect`** — inline `resetDb`, a one-line seed helper, then a cohesive
   set of assertions.

**Naming:** `describe` names the seam (`selectWords`, `collapseWordState`, `POST …/build`); `it`
is a behaviour sentence (`'returns the saved row when the word exists'`). Keep the trailing `(AC-n)` —
the deliberate exception to `comments.md`'s no-provenance rule: it maps a test to the feature AC that
`/sdd:verify` checks.

**Dose `describe`:** group by method only when a file has ≥4 tests over 2+ methods; ≤3 tests or one
method stays flat; never nest past two levels. A micro-`it` tree (one assert per leaf) is a
Jest+`beforeEach` artifact — here it would *duplicate* the inline seed across leaves, so prefer one
cohesive multi-assert scenario test (mirrors the seam-ownership rule below).

**Taste gate before extracting:** name the concrete repeat (construction cost or drift risk); extract
only if it removes more than it adds. Trivial derived constants (`const EN = enumLanguage.en`) and
single-file helpers (a local `roundtrip` / `byStage`) stay inline.

## What each layer tests — test the decision at its owning seam

A test covers the decisions **its own layer owns and that are decided nowhere else**; a higher layer
**composes/fakes the layer below and asserts only what it adds** (encoding, wiring, translation), never
re-asserting the lower layer's branch logic. Re-checking the same logic at every layer is the
duplication this rule prevents. Same family as `.claude/rules/deep-modules.md` (a module owns one
decision) — the test mirrors the module. Three kinds, by what they own:

- **Owned-logic** (most tests) — at the seam that *decides* the logic, with real deps below it: repo
  SQL/upsert/merge-patch; the dedup + four-state build policy; the pure state collapse + stage ordering
  (no DB); the schema/migration shape.
- **Wiring/contract** (few, at the top) — the edge's *own* concern only: HTTP route + param decode +
  success encoding + `Option→null`, plus **one** representative typed-error→4xx; the SQS
  `failedIds→batchItemFailures` envelope. One success + one error suffices — the type system already
  proves each *declared* endpoint error (a missing one fails `tsc`, never silently 500s), and per-state
  branching is owned below. Do **not** re-enumerate domain branches or re-assert row content here.
- **Adapter-contract** — exercise the real external adapter over a Testcontainer (the queue *and* the
  DB do this for **all** their tests — no fake). Only when a container is infeasible *and* a fast fake
  stays faithful, use the fake and pin the real `*Live` with one contract test. See the LocalStack
  section below.

**Seam/collaboration test** — the *positive* reason a top-level test exists: where two isolated
services meet only across a seam (the queue), one test composes **both halves with real collaborators**
and asserts the *outcome*, not either side's branches (e.g. request→queue→worker→Ready + redelivery
idempotency). A mock collaborator would defeat it. A cross-app HTTP-to-HTTP E2E would need its own
neutral test workspace, since the layer rule forbids one app importing another.

> At a higher layer assert **identity + the edge's own translation**, not the content/branches the
> layer below already owns. When you deliberately stop short, leave a one-line owner pointer at the site
> so the duplication isn't reintroduced.

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

## Test AWS services (LocalStack)

- The **same per-file Testcontainers pattern** extends to AWS adapters via LocalStack. For the **queue** it is the *only* double — every queue-touching test runs `JobsQueueLive` over `QueueClientLive` on a per-file LocalStack container (`QueueLocalStackLive`), like the DB; the in-memory fake was removed (rationale + the `drainQueue` / `ConsumePoll` helpers that contain SQS's non-deterministic receive: `packages/queue/CLAUDE.md`). **Prefer the real adapter over a hand-written fake wherever a container is feasible**; reach for a fast in-memory double only when a container is infeasible *and* the fake stays faithful, and then pin the real `*Live` with one contract test. **`@lexiai/storage/testing` (`StorageLocalStackLive` + `bucketObjects`/`resetBucket`) is built from this same `packages/queue/src/testing.ts` template** — `StorageLocalStackLive` runs the bound `ImagesStoreLive` over the real `StorageClientLive` S3 adapter on LocalStack; the in-memory `StorageServiceTest` writer (and the `S3Writer` seam it needed) was removed. A downstream suite that does no S3 I/O (text stages, provenance) provides the tiny local no-op `UnusedStorage` (an `ImagesStore` that dies on `put`) rather than booting a container.
- Image pinned to `localstack/localstack:4.4.0` (the last free, no-token community release — do not float to `:latest`). Unlike `PgContainer`, the LocalStack module's default wait strategy is log-based, so **no** `withWaitStrategy` override is needed.

## Effect tests

For Effect code, prefer `@effect/vitest`'s `it.effect` / `it.scoped` to run `Effect`s with proper resource management. See `repos/effect-smol/packages/effect/test` for idiomatic examples and `.claude/agent-patterns/effect-context-and-layer.md` for fixture patterns.
