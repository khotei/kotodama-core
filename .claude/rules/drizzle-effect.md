---
paths:
  - "database/**"
  - "core/repositories/**"
---

# Drizzle ⇄ Effect (the mandated pattern)

Use Drizzle's first-party Effect subpaths **`drizzle-orm/effect-schema` + `drizzle-orm/effect-postgres`**
(no extra npm package). **Verify against vendored `repos/drizzle/` (rc), NOT `orm.drizzle.team`** —
published docs still show Effect **v3** shapes (`@effect/sql-drizzle`, `Context.Tag('DB')`); adapt to
this repo's `Context.Service` + `Effect.fnUntraced` idiom. Before an app-side loop/dedup/aggregate/
`LIKE '%…%'`, reach for the one-construct Postgres primitive (`FILTER`, `ON CONFLICT`, jsonb
operators, window fns) behind a typed repo function — always `sql` with column references
(`` sql`… ${table.col} …` ``), never a raw untyped string.

**Vendored map** (`drizzle-orm@1.0.0-rc`): `repos/drizzle/drizzle-orm/src/effect-postgres/`
(`driver.ts` — `PgDrizzle.make`/`DefaultServices`), `src/effect-schema/` (`schema.ts` + `README.md`
worked example), `src/pg-core/`; worked tests
`repos/drizzle/integration-tests/tests/validators/effect-schema/pg.test.ts` + `tests/pg/`.

## DB layer — read `database/src/db.ts` first

- `PgDrizzle.make({ relations })` over a `PgClient` layer; `PgDrizzle.DefaultServices` supplies its
  no-op logger/cache.
- `PgClient` config via `@kotodama/platform/config` (`PgClient.layerConfig({ url: DatabaseUrl })`) —
  take just the one config it needs (`DatabaseUrl`), never a broad bundle. **Tests bypass this layer** (ephemeral
  Testcontainers Postgres, `@kotodama/database/testing`).
- Expose **layers only**; repositories `yield* DB` — **never** a bare `drizzle(...)`/driver.

## Schema conventions

- One folder per aggregate under `database/schema/` (`words/`), plus two domain-neutral folders —
  `primitives/` (shared value vocabularies: `language`, `async-job-status`) and `utils/` (internal
  build helpers: `columns`, `to-enum`). All re-exported by `schema/index.ts` — the sole
  `drizzle.config` `schema` entry (a directory glob would double-count the barrel's re-exports) —
  **except `utils/columns` (internal, not re-exported)**.
- Tables: `…Table` suffix, `snakeCase.table` — **never also set `transformQueryNames`**. Export
  `<Entity>Row = typeof table.$inferSelect`.
- **Value lists: one `as const` tuple is the single source** — union, `toEnum` map, `pgEnum`,
  `Schema.Literals` all derive from it; reference by name, never hardcode. **Derive from the tuple,
  never from a `pgEnum` object** (`enumValues` mutates to objects at runtime — drizzle #2753). A
  jsonb-nested union gets no `pgEnum`. **`WORD_BUILD_STAGES` declaration order is load-bearing** —
  pipeline + Postgres sort + UX stepper order; reorder only to reorder the stepper.

## Entities — `createSelectSchema` WITH jsonb overrides

`$type<T>` does **NOT** survive `createSelectSchema` (it keys off the SQL dataType, so
`jsonb().$type<Tiers>()` collapses to the opaque `Json` union). Always pass the refine map
(`createSelectSchema(wordsTable, { tiers: TiersEntity, … })`). A bare-schema override owns its own
nullability (wrap nullable columns in `Schema.NullOr`); a function refinement inherits the column's.
Co-locate content schemas + entity in `<entity>.entity.ts`; the table reads each `$type` via a
type-only import (erased — no runtime cycle).

Reads return `<Entity>Row` (trusted, no decode); the `Entity` schema is the API-contract payload and
the validated shape at write/untrusted boundaries.

**`NullOr` vs `optionalKey` is load-bearing under `patchOnConflict`:** `Schema.NullOr` always carries
its key, so "no data" decodes to `null` and **clears** the column — express "absent = keep" with
`Schema.optionalKey`, never by passing `null`.
