---
paths:
  - "core/database/**"
  - "core/repositories/**"
---

# Drizzle ⇄ Effect (the mandated pattern)

**Always use Drizzle's two first-party Effect integrations** — `drizzle-orm/effect-schema` and
`drizzle-orm/effect-postgres` (subpath exports, no extra npm package). **Source of truth = the
vendored `rc` source** (`repos/drizzle/`, read-only — see `.claude/rules/vendored-sources.md`),
NOT `orm.drizzle.team` — the published docs still show the Effect **v3** shapes
(`@effect/sql-drizzle`, `Context.Tag('DB')`); adapt to this repo's `Context.Service` +
`Effect.fnUntraced` idiom. Cheat-sheet with worked snippets:
`.claude/agent-patterns/drizzle-effect.md`.

**Reach for the Postgres primitive first:** before hand-writing a loop over rows, a second query
per row, a manual aggregate/dedup, or a slow `LIKE '%…%'` in application code, check whether
Postgres does it in one construct — the recognition map (symptom → primitive) is
`.claude/agent-patterns/postgres-capabilities.md`.

## DB layer

Canonical implementation: `core/database/src/db.ts` — read it first.

- `PgDrizzle.make({ relations })` over a `PgClient` layer; `PgDrizzle.DefaultServices` supplies the
  no-op logger/cache it requires.
- `PgClient` config goes through `@kotodama/platform/config` (`PgClient.layerConfig({ url: DatabaseUrl })`) —
  take the one config you need, not the whole `AppConfig` bundle. DB **tests** bypass this layer
  entirely (ephemeral Testcontainers Postgres — `@kotodama/core/database/testing`).
- Expose **layers only** (`PgClientLive`, `DBLive`, `DatabaseLive`); `core/repositories/*` `yield*`
  the `DB` service — **never** a bare `drizzle(...)`/driver or a hand-rolled `PgClient`.

## Schema conventions

- **One folder per aggregate** under `core/database/schema/`, re-exported by the `schema/index.ts`
  barrel — the single `drizzle.config` `schema` entry (`core/drizzle.config.ts`, `schema:
  ./database/schema/index.ts`, `out: ./database/migrations`; a directory glob would double-count the
  barrel's re-exports).
- Table exports are suffixed `…Table` (`wordsTable`), declared with `snakeCase.table` — **never
  also set `transformQueryNames`**. The table file also exports `<Entity>Row`
  (`typeof <table>.$inferSelect`).
- **Value lists: an `as const` tuple is the single source** — the union type, the `toEnum` named
  map (`schema/to-enum.ts`), the `pgEnum`, and any `Schema.Literals` all derive from it. Reference
  values by name (`enumAsyncJobStatus.pending`), never hardcode the strings. Derive from the tuple,
  never from a `pgEnum` object (`enumValues` mutates to objects at runtime — drizzle #2753). A
  jsonb-nested union gets NO `pgEnum` (no column backs it). **`WORD_JOB_STAGES` declaration order
  is load-bearing** — it is the pipeline/display order AND the Postgres sort order; reorder it only
  to reorder the UX stepper.

## Entities: `createSelectSchema` WITH jsonb overrides

A bare `createSelectSchema(table)` is unfit: **`$type<T>` does NOT survive derivation** — the
derivation keys off the column's SQL dataType (`json`), so `jsonb().$type<Tiers>()` becomes the
opaque `Json` union. Always pass the refine map: `WordEntity = createSelectSchema(wordsTable,
{ tiers: TiersEntity, … })`. A bare-schema override owns its own nullability (wrap nullable columns
in `Schema.NullOr` yourself); a function refinement inherits the column's. Content schemas + the
entity live together in one `<entity>.entity.ts`; the table reads each `$type` via a type-only
import back into the entity file (erased — no runtime cycle).

Reads return `<Entity>Row` (trusted, no decode); the `Entity` schema earns its keep as the API
contract's per-row payload and as the validated shape at write/untrusted boundaries.

**`NullOr` vs `optionalKey` is load-bearing under `patchOnConflict`** (merge-patch writes):
`Schema.NullOr` always carries its key, so "no data" decodes to an explicit `null` and **clears**
the column — express "absent = keep" with `Schema.optionalKey`, never by passing `null`.

## Version floor

`drizzle-orm@1.0.0-rc` (**≥ `rc.1`** — the first release whose Effect integrations are native
Effect v4 beta; the `beta.15`–`beta.21` line is Effect v3, do not cite it). Vendored and
catalog-pinned to the same `rc` tag.
