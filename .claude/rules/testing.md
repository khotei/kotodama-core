---
paths:
  - "**/test/**"
  - "**/*.test.ts"
  - "**/vitest.*.ts"
---

# Testing

**Keep the trailing `(AC-n)` on `it` names** — the one exception to comments.md's no-provenance
rule: it maps a test to the feature AC that `/sdd:verify` checks.

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

- DB tests: ephemeral Testcontainers Postgres via `@kotodama/database/testing` (`TestDatabaseLive`,
  self-migrating, + `resetDb`) — the URL is per-container, so there is **no `.env.test`** and no way
  to hit dev.
- Queue/storage tests: the real `*Live` layers over per-file LocalStack — surfaces + rules in
  `platform/{queue,storage}/CLAUDE.md`. LocalStack stays pinned `4.4.0` (`:latest` now demands an
  auth token — the full story is a comment in `infra/local/docker-compose.yml`).
