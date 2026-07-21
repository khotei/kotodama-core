# database — `@kotodama/core/database`

Drizzle schema, relations, migrations, seed, and the `DB` layer. Schema *mechanics* (folder
layout, `…Table` suffix, entity derivation) live in `.claude/rules/naming.md` +
`.claude/rules/drizzle-effect.md` — this file is only the constraints those can't localize.

- **Schema authority — entity-level ONLY:** this package authors the *storage* vocabulary (value
  tuples + `pgEnum`s, content schemas suffixed `Entity`, the `<Name>Entity`/`<Name>EntityInsert`
  row schemas). **Shapes *derived* from the entities live in the core package that owns them,
  never here** — the `Word` union is `core-words`', `WordContent` is `core-content`'s, the views
  are the API edge's. One author per shape, no cycle.
- **`words` is one lifecycle row:** every row carries `status` (the reused `async_job_status`
  enum — never a second enum) and all content columns are **nullable** (a row exists from the
  moment a build is requested). The `CHECK (status <> 'succeeded' OR <every content column IS NOT
  NULL>)` restores "ready ⇒ complete" at the engine — don't chase `NOT NULL` on content columns.
  `frequency` stays nullable AND outside the CHECK (analytics-owned). `status` has **no column
  default** — the write path states it. `WordEntity` stays the strict ready-row shape (the core
  union owns storage permissiveness at decode); `WordEntityInsert` makes content columns
  `Schema.NullOr` (carries-and-clears under merge-patch — never `optionalKey`). Per-stage build
  progress rides inline on `words.stages` (`BuildStagesEntity`, `NOT NULL DEFAULT '[]'`) — there is
  no second table; a transition co-writes `stages` with `status`.
- **One schema piece is hand-authored in the baseline migration** (drizzle-kit can't emit it), so
  a fresh `db:generate` reports no drift yet apply installs it: `CREATE EXTENSION pg_trgm` (ahead
  of the trgm GIN indexes). If the schema changes, re-generate then **re-patch that block** into
  the new baseline.
- **Migrations** use the drizzle-kit rc format: one timestamped folder per migration
  (`migration.sql` + `snapshot.json`, chained via `prevIds` — no central `_journal.json`).
- `db:*` scripts are config-driven through `@kotodama/platform/config` (no hardcoded URLs); they target the
  **dev** DB. Tests never touch it — ephemeral Testcontainers Postgres via
  `@kotodama/core/database/testing` (`TestDatabaseLive` migrates itself; `resetDb` per test — see
  `.claude/rules/testing.md`).

**May import:** `@kotodama/*` packages, `effect`, `@effect/sql-pg`, drizzle. **Never** `core/*`,
`repositories/*`, `apps/*`.
