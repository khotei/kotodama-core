# database — `@lexiai/database`

Drizzle schema, relations, migrations, seed, and the `DB` layer. Owns the SQL layer. The schema
*mechanics* (the `…Table` suffix, `snakeCase.table`, `<Entity>Row` = `$inferSelect`) live in
`@.claude/rules/naming.md` + `drizzle-effect.md` — this file is the constraints and pointers those
can't localize.

- **May import:** `@lexiai/*` packages, `effect`, `@effect/sql-pg`, drizzle, `@lexiai/config`.
  **Never** `core/*`, `repositories/*`, `apps/*`. No HTTP code.
- **Schema is grouped by aggregate/domain, not per table** — one folder per repo boundary
  (`schema/words/`, `schema/async-word-jobs/`; a word's generation is **one `async_word_jobs` row per
  `(word, language, stage)`** — `StageState` flattened into columns, not a `payload` jsonb), re-exported
  by the single `schema/index.ts` barrel that `drizzle.config.ts` points at (a directory glob would
  double-count the barrel's re-exports).
- **Schema authority (this is the bottom of the chain):** `database/` authors the word vocabulary
  and persistence schemas — content effect-schemas (`<entity>.content.ts`), value tuples + `pgEnum`s
  (`<entity>.values.ts`/`enums.ts`), and the `<Name>Entity` row schemas (`<entity>.entity.ts`,
  `createSelectSchema` + jsonb overrides so columns are typed, not opaque `Json`). **Both tables
  (`words`, `async_word_jobs`) follow this identically** — content schemas → entity. Consumers use the
  rows/entities directly (the API contracts compose `WordEntity`); `core/` authors only computed read
  models whose leaves derive from the entities (`WordStateModel`). One author per shape, no cycle. The
  `<Name>EntityInsert` schemas validate untrusted writes (`WordBuilder.promote`). See `drizzle-effect.md`.
- **Layers (`src/db.ts`):** this package *exposes* layers only — `apps/*` compose them; `DatabaseLive`
  is the self-contained one. Wiring details: `drizzle-effect.md`.
- **`db:*` scripts are config-driven** through `@lexiai/config` (`ConfigProviderLive` + `DatabaseUrl`)
  — no hardcoded URLs. They target the **dev** DB (`lexiai_dev` by default; override with an exported
  `DATABASE_URL`). `db:reset` / `db:seed` are `echo` placeholders until a feature needs them.
- **Migrations** (`migrations/`) use the drizzle-kit rc format: one timestamped folder per migration
  (`migration.sql` + `snapshot.json`, chained via `prevIds` — no central `_journal.json`).
- **Tests** run against an ephemeral Testcontainers Postgres (needs Docker), never the dev DB — so
  there's no `.env.test`. Surface: `@lexiai/database/testing` — `TestDatabaseLive` (migrates itself at
  layer build) + `resetDb`. One container per file; `resetDb` at the top of each test. See
  `@.claude/rules/testing.md`.

## How LexiAI uses Drizzle (pointers)

- **Mandate** (the *how*): `@.claude/rules/drizzle-effect.md` — the two first-party Effect integrations
  (`effect-schema` + `effect-postgres`), the `Context.Service` idiom, the schema-boundary rule.
- **Cheat-sheet:** `.claude/agent-patterns/drizzle-effect.md` (the entry point — there is no Drizzle `LLMS.md`).
- **Vendored source** (read-only, never import): `repos/drizzle/` @ `v1.0.0-rc.3`. See `@.claude/rules/vendored-sources.md`.
