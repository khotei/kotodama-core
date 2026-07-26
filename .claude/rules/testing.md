---
paths:
  - "**/test/**"
  - "**/*.test.ts"
  - "**/vitest.*.ts"
---

# Testing

- **Runner `@effect/vitest`** — import helpers from it, not `vitest`; prefer `it.effect`/`it.scoped`.
- **`bun run test`, never `bun test`** (per-package `bun run --filter '@kotodama/<name>' test`); the `--bun` flag + aggregate-run ban live in `tooling.md`.
- **Files:** `*.test.ts` under each workspace's `test/` (sibling of `src/`, mirroring it), imported via `../src/…`; `test/` is in tsconfig `include` so `tsc` checks it.
- **Keep the trailing `(AC-n)`** on `it` names — the one exception to no-provenance: it maps a test to the feature AC that `/sdd:verify` checks.

## DAMP, not lifecycle hooks

`@effect/vitest` has no layer-aware hook — the layer's services exist only inside `it.effect`, so a
`beforeEach` can't `yield*` them and one providing its own layer builds a **second container**. So:
one `it.layer(TestLayer, { timeout })` per file, `resetDb`/`drainQueue` called inline at the top of
each test. Dedupe only with called `Effect` helpers (on a `<pkg>/testing` subpath), never hooks.

## Layer ownership

A test covers only its own layer's decisions; a higher layer fakes the layer below and asserts only
what it adds (encoding, wiring, translation), never the lower layer's branches. Edge wiring tests
need one success + one representative typed error. When you stop short, leave a one-line owner pointer.

## Test infra (needs Docker)

- DB tests run against **ephemeral Testcontainers Postgres** — URL is per-container, so there is **no `.env.test`** and no way to hit dev. Surface `@kotodama/database/testing`: `TestDatabaseLive` (self-migrating) + `resetDb`.
- Queue/storage tests run the real `*Live` layers over per-file LocalStack (`@kotodama/platform/{queue,storage}/testing`); prefer the real adapter over a fake. A suite doing no S3 I/O provides the no-op `UnusedStorage` instead of a container.
- LocalStack pinned `localstack/localstack:4.4.0` (last free community release — don't float `:latest`).
