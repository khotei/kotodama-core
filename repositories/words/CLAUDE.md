# repositories/words — `@lexiai/repositories-words`

The pristine `words` aggregate over `DB` (Feature §v7) — three **bare persistence functions**,
`selectWords` + `selectWord` + `upsertWords`. Types are the contract; read `src/words.repo.ts`. This file is the *why*.

There is **no `WordsRepo` object or `Context.Service`** — the repo is the thin DB layer, so its ops are
plain exported functions whose **DB-verb prefix marks the layer** (`select`/`upsert`). Each is an
`Effect.fnUntraced` that `yield*`s `DB` inside, so callers write `selectWords(q)` / `upsertWords(c)` and
the `DB` requirement rides their `R` channel — the app entrypoint provides `DatabaseLive`. Not a service:
it owns no resource and is never test-swapped (the swap point is `DB`). See "Service vs plain function"
in `.claude/rules/effect-conventions.md`.

## The surface (and the pristine invariant it protects)

`words` is **pristine: a row exists ⇔ the word is ready** (the generation lifecycle lives in
`async_word_jobs`, not here). Two **purely functional** ops — the repo checks no domain invariants and
fails with no domain errors; absence is a value, and "should this row exist?" is a core question:

- **`selectWords(query)`** — the general read, returning all matches (absence = empty array).
  `WordsQuery` filters by `id`/`word`/`language` (each a single value or an array) + a `search` ILIKE
  prefix on `word` + `limit`. No `selectById`/`searchByPrefix` — every multi-row read question is one
  query shape.
- **`selectWord(language, word)`** — the single-word read: `selectWords({ language, word, limit: 1 })`,
  destructured and lifted to `Option<WordRow>` (the one place that `Option`-wraps, so consumers don't
  repeat it). The lone `Option`-returning op here — a deliberate convenience exception to the repo's
  "rows, not `Option`" default (the two production callers, `readWordBuildSnapshot` and `getWord`, both
  want it), kept beside `selectWords` rather than one layer up in `core/`.
- **`upsertWords(content | content[])`** — the only write: insert, or **replace the existing row's
  content** on `UNIQUE(word, language)`, covering first-gen and regen in one idempotent call. Overloaded:
  a single content → the row; an array → a row per item. Each content is its **own**
  `INSERT … ON CONFLICT DO UPDATE` (a plain per-content loop) whose conflict set is
  `patchOnConflict(wordsTable, content)` (the shared `@lexiai/database` helper: merge-patch — every
  column the content carries lands verbatim from `excluded`, storage envelope kept). Per-content (not
  one multi-row statement) so a batch whose rows carry **different optional columns** works out of the
  box — futureproof against a column going optional — at the cost of cross-row atomicity (**no
  transaction**: a failing row leaves earlier ones saved). Today `WordContent` requires every content
  column, so an upsert is a full content replace; `frequency: null` **clears** a stored frequency (the
  content is the whole truth).

Because `upsertWords` takes complete content and is the only write, a half-word is not just forbidden but
**inexpressible** through this interface. Partial generation state lives in `async_word_jobs.result`
and is assembled + decoded (through an `effect/Schema`) by the worker *before* `upsertWords`.

> **Decision — `upsertWords` replaces content; explicit `null` clears (2026-06-12, user-driven; supersedes
> the same-day "merge, never clear" coalesce decision).** The conflict set is now `patchOnConflict`
> (merge-patch): every column the content carries lands verbatim, so a regen with `frequency: null`
> **clears** a stored frequency — the engine's output is the whole truth, consistent with every other
> (NOT NULL) column being fully replaced. The coalesce merge protected a stored `frequency` from a
> content that "doesn't know" it — but `WordEntityInsert.frequency` is `Schema.NullOr`, so the key is
> always carried and "no data" was indistinguishable from "clear" anyway. If keep-semantics are ever
> really needed, express absence in the *schema* (`Schema.optionalKey` ⇒ key omitted ⇒ column kept),
> never by special-casing the helper. Today nothing is lost: the only writer (promotion) always
> carries a generated frequency.

> **Decision — `update` deleted (2026-06-12, user-driven "fewer, deeper methods").**
> `update` (partial field update, `WordNotFoundError`) had zero production callers and a hard
> ceiling: Postgres upsert cannot express a partial update (INSERT needs every NOT NULL column), so
> it could never merge into `upsertWords`. Deleted as speculative generality; the future `frequency`
> feature re-decides (read-merge-upsert vs a narrow update).

> **Decision — single-word read lives here as `selectWord`, not in `core/` (2026-06-20, user-driven;
> reverses the 2026-06-12 "inline as `findWord` in `core/words`" call).** The `Option`-lifting
> single-word read was briefly `findWord` in `core/words` (the verb-as-layer-marker argument: `find*` =
> domain read, `select*` = raw persistence). The user chose to keep it beside `selectWords` as
> `selectWord` instead — the single-word read is just a `limit: 1` shaping of the catalog read, so it
> reads more cohesively next to its sibling. The cost accepted: it is the one `select*` op returning
> `Option` rather than rows, and `core/words` no longer authors a word read.

## Constraints (not visible from this repo's own code)

- **Return `WordRow` (`$inferSelect`), not the derived `WordSchema`** — `effect-schema` erases the
  jsonb `$type` to opaque `Json` (Feature §11 spike); the Row preserves it. Same call as the jobs repo.
- **Error channel is `EffectDrizzleQueryError` only** (the rc `effect-postgres` integration). No
  method opens a transaction or fails with a domain error.
- **`upsertWords` with the same `(word, language)` twice in one batch is last-write-wins**, not an error
  — each content is its own statement (per-content loop), so the second upserts over the row the first
  wrote.

## Boundaries

- May import `@lexiai/database` + other `@lexiai/*`, `effect`, `@effect/sql-pg`, and `drizzle-orm`
  query helpers only — never a bare `drizzle()`/driver. Never `core/*` or `apps/*`.
- Patterns: `.claude/agent-patterns/effect-context-and-layer.md`, `drizzle-effect.md`.
- Tests are DB-backed (Testcontainers — needs a Docker daemon): `bun run --filter '@lexiai/repositories-words' test`.
