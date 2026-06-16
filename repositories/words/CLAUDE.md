# repositories/words — `@lexiai/repositories-words`

`WordsRepo` — the pristine `words` aggregate over `DB` (Feature §v7). Types are the contract; read
`src/words.repo.ts`. This file is the *why*.

## The surface (and the pristine invariant it protects)

`words` is **pristine: a row exists ⇔ the word is ready** (the generation lifecycle lives in
`async_word_jobs`, not here). Two **purely functional** methods — the repo checks no domain
invariants and fails with no domain errors; absence is a value, and "should this row exist?" is a
core-service question:

- **`find(query)`** — the one read, returning all matches (absence = empty array). `WordsQuery`
  filters by `id`/`word`/`language` (each a single value or an array) + a `search` ILIKE prefix on
  `word` + `limit`. No `findOne`/`findById`/`searchByPrefix` — every read question is one query shape
  (the single word is `{ language, word, limit: 1 }`; destructure the row, wrap in `Option` at the
  consumer if it wants one).
- **`save(content | content[])`** — the only write: insert, or **replace the existing row's content**
  on `UNIQUE(word, language)`, covering first-gen and regen in one idempotent call. Overloaded: a
  single content → the row; an array → a row per item. Each content is its **own**
  `INSERT … ON CONFLICT DO UPDATE` (a plain per-content loop) whose conflict set is
  `patchOnConflict(wordsTable, content)` (the shared `@lexiai/database` helper: merge-patch — every
  column the content carries lands verbatim from `excluded`, storage envelope kept). Per-content (not
  one multi-row statement) so a batch whose rows carry **different optional columns** works out of the
  box — futureproof against a column going optional — at the cost of cross-row atomicity (**no
  transaction**: a failing row leaves earlier ones saved). Today `WordContent` requires every content
  column, so a save is a full content replace; `frequency: null` **clears** a stored frequency (the
  content is the whole truth).

Because `save` takes complete content and is the only write, a half-word is not just forbidden but
**inexpressible** through this interface. Partial generation state lives in `async_word_jobs.result`
and is assembled + decoded (through an `effect/Schema`) by the worker *before* `save`.

> **Decision — `save` replaces content; explicit `null` clears (2026-06-12, user-driven; supersedes
> the same-day "merge, never clear" coalesce decision).** The conflict set is now `patchOnConflict`
> (merge-patch): every column the content carries lands verbatim, so a regen with `frequency: null`
> **clears** a stored frequency — the engine's output is the whole truth, consistent with every other
> (NOT NULL) column being fully replaced. The coalesce merge protected a stored `frequency` from a
> content that "doesn't know" it — but `WordEntityInsert.frequency` is `Schema.NullOr`, so the key is
> always carried and "no data" was indistinguishable from "clear" anyway. If keep-semantics are ever
> really needed, express absence in the *schema* (`Schema.optionalKey` ⇒ key omitted ⇒ column kept),
> never by special-casing the helper. Today nothing is lost: the only writer (promotion) always
> carries a generated frequency.

> **Decision — `update`/`findOne` deleted (2026-06-12, user-driven "fewer, deeper methods").**
> `update` (partial field update, `WordNotFoundError`) had zero production callers and a hard
> ceiling: Postgres upsert cannot express a partial update (INSERT needs every NOT NULL column), so
> it could never merge into `save`. Deleted as speculative generality; the future `frequency` feature
> re-decides (read-merge-save vs a narrow update). `findOne` was a 2-line `find` + `Option` wrapper
> with two callers — inlined at the call sites.

## Constraints (not visible from this repo's own code)

- **Return `WordRow` (`$inferSelect`), not the derived `WordSchema`** — `effect-schema` erases the
  jsonb `$type` to opaque `Json` (Feature §11 spike); the Row preserves it. Same call as the jobs repo.
- **Error channel is `EffectDrizzleQueryError` only** (the rc `effect-postgres` integration). No
  method opens a transaction or fails with a domain error.
- **`save` with the same `(word, language)` twice in one batch is last-write-wins**, not an error —
  each content is its own statement (per-content loop), so the second upserts over the row the first
  wrote.

## Boundaries

- May import `@lexiai/database` + other `@lexiai/*`, `effect`, `@effect/sql-pg`, and `drizzle-orm`
  query helpers only — never a bare `drizzle()`/driver. Never `core/*` or `apps/*`.
- Patterns: `.claude/agent-patterns/effect-context-and-layer.md`, `drizzle-effect.md`.
- Tests are DB-backed (Testcontainers — needs a Docker daemon): `bun run --filter '@lexiai/repositories-words' test`.
