# repositories/words — `@lexiai/repositories-words`

`WordsRepo` — the pristine `words` aggregate over `DB` (Feature §v7). Types are the contract; read
`src/words-repo.ts`. This file is the *why*.

## The surface (and the pristine invariant it protects)

`words` is **pristine: a row exists ⇔ the word is ready** (the generation lifecycle lives in
`async_word_jobs`, not here). Four deep methods (mirroring `AsyncWordJobsRepo`'s idioms — one flexible query
type, single-or-array writes, absence-as-`Option`):

- **`find(query)` / `findOne(query)`** — the one read, returning all matches / the first `Option`.
  `WordsQuery` filters by `id`/`word`/`language` (each a single value or an array) + a `search` ILIKE
  prefix on `word` + `limit`. No `findById`/`searchByPrefix`/… slice-explosion — all are shapes of `find`.
- **`create(content | content[])`** — the single promotion **upsert** on `UNIQUE(word, language)`,
  covering first-gen (insert) and regen (replace-in-place). Overloaded: a single content → the row; an
  array → a row per item, applied atomically in a `db.transaction` (so that overload adds `SqlError`).
- **`patch(language, word, partial)`** — updates fields on an **existing** row (e.g. `frequency`);
  `WordNotFoundError` if absent.

Two invariants the surface upholds:
- **No `initiate`** — no thin row born at lookup; a `words` row only ever appears complete.
- **`patch` ≠ `patchDetails`** — it edits an already-complete row, never accumulates partial content.
  Partial generation state lives in `async_word_jobs.result` (one row per stage) and is assembled +
  decoded (through an `effect/Schema`) by the worker *before* `create`, so `words` never holds half a word.

## Constraints (not visible from this repo's own code)

- **Return `WordRow` (`$inferSelect`), not the derived `WordSchema`** — `effect-schema` erases the
  jsonb `$type` to opaque `Json` (Feature §11 spike); the Row preserves it. Same call as the jobs repo.
- **Error channel is `EffectDrizzleQueryError`** on every query (the rc `effect-postgres` integration,
  not the spec's bare `SqlError`); `patch` adds `WordNotFoundError`, and `create`'s **array** overload
  also `SqlError` (it wraps the batch in `db.transaction`). The single-content `create` has no `SqlError`.

## Boundaries

- May import `@lexiai/database` + other `@lexiai/*`, `effect`, `@effect/sql-pg`, and `drizzle-orm`
  query helpers only (`and`/`eq`/`inArray`/`ilike`) — never a bare `drizzle()`/driver. Never `core/*` or `apps/*`.
- Patterns: `.claude/agent-patterns/effect-context-and-layer.md`, `drizzle-effect.md`.
- Tests are DB-backed (Testcontainers — needs a Docker daemon): `bun run --filter '@lexiai/repositories-words' test`.
