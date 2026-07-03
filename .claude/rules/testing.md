---
paths:
  - "**/test/**"
  - "**/*.test.ts"
  - "**/vitest.*.ts"
---

# Testing

- **Runner:** `@effect/vitest` — import test helpers from it, **not** `vitest`; prefer
  `it.effect`/`it.scoped` for Effect code.
- **Run:** `bun run test` (never `bun test`); per package `bun run --filter '@kotodama/<name>' test`.
  The `--bun` flag and the ban on aggregate multi-project `vitest run` are explained in
  `.claude/rules/tooling.md` — don't restructure the test scripts without reading it.
- **Files:** `*.test.ts` in each workspace's `test/` folder (sibling of `src/`, mirroring its
  structure), imported via `../src/…`; the folder is in tsconfig `include` so `tsc` checks tests.
- **Naming:** `describe` names the seam; `it` is a behaviour sentence. Keep the trailing `(AC-n)` —
  the deliberate exception to the no-provenance rule: it maps a test to the feature AC that
  `/sdd:verify` checks.

## Structure & reuse — DAMP over DRY

Keep each test's Arrange visible; dedupe with **called `Effect` helpers** (on a `<pkg>/testing`
subpath), **never lifecycle hooks** — `@effect/vitest` has no layer-aware hook: the layer's
services exist only inside `it.effect`, so a `beforeEach` can't `yield*` them, and a hook providing
its own layer would build a **second container**. So: one `it.layer(TestLayer, { timeout })` per
file, `resetDb`/`drainQueue` called inline at the **top of each test**. Extract a helper only when
it removes more than it adds; trivial constants and single-file helpers stay inline.

## What each layer tests

A test covers the decisions **its own layer owns**; a higher layer composes/fakes the layer below
and asserts only what it *adds* (encoding, wiring, translation) — never re-asserting the lower
layer's branch logic. Wiring/contract tests at the edge need one success + one representative typed
error (the type system already proves each declared endpoint error compiles). Where two isolated
services meet across a seam (the queue), one collaboration test composes both halves with real
collaborators and asserts the outcome. When you deliberately stop short, leave a one-line owner
pointer at the site.

## Test databases & AWS (Testcontainers / LocalStack)

- DB tests run against an **ephemeral Testcontainers Postgres**, never the dev DB — the URL is
  generated per container, so there is **no `.env.test`** and structurally no way to hit dev.
  Requires a Docker daemon. Surface: `@kotodama/database/testing` — `TestDatabaseLive` (migrates
  itself at layer build) + `resetDb` (TRUNCATEs every `public` table, enumerated dynamically).
- **Prefer the real adapter over a hand-written fake wherever a container is feasible.** Queue and
  storage tests run the real `*Live` layers over per-file LocalStack containers
  (`@kotodama/queue/testing`, `@kotodama/storage/testing`); the in-memory fakes were removed. A suite
  that does no S3 I/O provides the no-op `UnusedStorage` instead of booting a container.
- LocalStack image is pinned to `localstack/localstack:4.4.0` (the last free, no-token community
  release — do not float to `:latest`). Unlike `PgContainer`, its default wait strategy needs no
  override.
