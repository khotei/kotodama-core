# database — `@kotodama/database`

Drizzle schema, relations, migrations, seed, and the `DB` layer. Schema *mechanics* live in
`.claude/rules/{naming,drizzle-effect}.md` — this file is only the constraints those can't localize.

- **Schema authority is entity-level ONLY:** this package authors the *storage* vocabulary (value
  tuples, `pgEnum`s, `*Entity` row/content schemas). Shapes *derived* from the entities live in the
  core package that owns them — the `Word` union is `core/words`', `WordContent` is `core/content`'s,
  the views are the API edge's. One author per shape, no cycle.
- **`words` is one lifecycle row:** every row carries `status` (the reused `async_job_status` enum —
  never a second enum) and all content columns are **nullable** (the row exists from build request).
  The `CHECK (status <> 'succeeded' OR <content NOT NULL>)` restores "ready ⇒ complete" at the engine
  — don't chase `NOT NULL` on content columns. `frequency` stays nullable AND outside the CHECK
  (analytics-owned). `status` has **no column default** — the write path states it. `WordEntityInsert`
  makes content `Schema.NullOr` (carries-and-clears under merge-patch — never `optionalKey`).
  Per-stage progress rides inline on `words.stages` (`NOT NULL DEFAULT '[]'`) — there is no second
  table.
- **`CREATE EXTENSION pg_trgm` is hand-authored in the baseline migration** (drizzle-kit can't emit
  it, ahead of the trgm GIN indexes) — a fresh `db:generate` reports no drift, but re-generating the
  baseline means **re-patching that block**.
- Migrations use the drizzle-kit rc format (per-migration folder chained via `prevIds`, no central
  `_journal.json`). `db:*` scripts target the **dev** DB; tests use ephemeral Testcontainers
  (`@kotodama/database/testing`) — see `.claude/rules/testing.md`.
