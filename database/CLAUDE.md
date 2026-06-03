# database — `@lexiai/database`

Drizzle schema, relations, migrations, seed. Owns the SQL layer.

- **May import:** `@lexiai/*` packages only (`effect`, `@effect/sql-pg`, drizzle, `@lexiai/config`).
- **MUST NOT import:** `core/*`, `repositories/*`, `apps/*`. No HTTP code here.
- **Schema (`schema/<entity>/{<entity>.table.ts, <entity>.schemas.ts}`):** tables via
  `snakeCase.table` exported as `…Table` (`wordsTable`); derived `effect/Schema` row-schemas
  `<Entity>Row` / `<Entity>RowInsert` (they `import 'drizzle-orm'`, so they stay here, never in
  `@lexiai/schemas`). `schema/index.ts` is the barrel (tables + row-schemas + `relations`).
- **Layers (`src/db.ts`):** `DB` (`Context.Service`), `DBLive` (needs a `PgClient`),
  `PgClientLive` (`layerConfig` ← `@lexiai/config`'s `DatabaseUrl`), and `DatabaseLive`
  (self-contained). This package only *exposes* layers — `apps/*` compose them.
- **`db:*` scripts:** `db:generate` / `db:migrate` / `db:push` invoke real `drizzle-kit`, which
  reads `drizzle.config.ts` — and that resolves `DATABASE_URL` through `@lexiai/config`
  (`ConfigProviderLive` + `DatabaseUrl`), so the target DB is config-driven (default → `lexiai_dev`
  from the root `.env`; override per command with an exported `DATABASE_URL`) — no bespoke
  migrator, no hardcoded URLs. These migrate the **dev** DB; tests migrate themselves (below).
  `db:reset` / `db:seed` remain `echo` placeholders until a feature needs them.
- **Migrations** live in `migrations/` (drizzle-kit rc format: one timestamped folder per
  migration with `migration.sql` + `snapshot.json`, chained via `prevIds` — no central
  `_journal.json`). `drizzle.config.ts` points `schema` at the single `./schema/index.ts`
  barrel (a directory glob would double-count tables the barrel re-exports).
- **Tests** run against an **ephemeral Testcontainers Postgres** (needs Docker), never the dev DB —
  the generated URL can't be the dev one, so there's no `.env.test` / safety belt. The test surface
  is **`@lexiai/database/testing`** (`src/testing.ts`): **`TestDatabaseLive`** (a `DB` layer over a
  fresh container with **migrations applied at layer build** via `drizzle-orm/effect-postgres/migrator`
  — the suite migrates itself) and **`resetDb`** (an **Effect consuming `DB`** that `TRUNCATE`s every
  `public` table dynamically, leaving the `drizzle`-schema migration record intact). Use
  `it.layer(TestDatabaseLive)` (one container per file) and call `resetDb` at the **start of each
  test** — reset must run in the shared `it.layer` runtime, not an `afterEach` (which would start a
  second container). See `@.claude/rules/testing.md`.

## How LexiAI uses Drizzle

- **Mandate:** `@.claude/rules/drizzle-effect.md` — the *how* (the two first-party Effect integrations `drizzle-orm/effect-schema` + `drizzle-orm/effect-postgres`, the `Context.Service` idiom adaptation, and the schema-boundary rule: generated row-schemas live here in `database/`, never in the isomorphic `@lexiai/schemas`).
- **Cheat-sheet:** `.claude/agent-patterns/drizzle-effect.md` — worked `pgTable → createSelectSchema` and `PgDrizzle` + `Layer` snippets adapted to LexiAI idioms. This is the entry point (there is no Drizzle `LLMS.md`).
- **Vendored source (read-only, never import):** `repos/drizzle/` — pinned to `v1.0.0-rc.3` (native Effect v4). Grep it for `pgTable`, `createSelectSchema`, `PgDrizzle.make`, relations, and migration patterns. See `@.claude/rules/vendored-sources.md`.
