---
paths:
  - "database/**"
  - "repositories/**"
---

# Drizzle ⇄ Effect (the mandated pattern)

How LexiAI talks to Postgres. **Always use Drizzle's two first-party Effect integrations** —
both are subpath exports of `drizzle-orm` (no extra npm package). **Source of truth = the
vendored `rc` source**, not the `orm.drizzle.team` docs (those still show the **Effect v3**
shapes — `@effect/sql-drizzle`, `Context.Tag`, `@effect/sql/SqlError`). Cheat-sheet with worked
snippets: `.claude/agent-patterns/drizzle-effect.md`. Vendored: `repos/drizzle/` (read-only —
never import; see `.claude/rules/vendored-sources.md`).

## DB layer — `drizzle-orm/effect-postgres`

**Canonical implementation: `database/src/db.ts`** (built in F-PLAT-004/T03 — read it
first; the snippets below and the cheat-sheet mirror it).

- Obtain the client with **`PgDrizzle.make({ relations })`** (or `makeWithDefaults({ relations })`)
  over a `PgClient` layer. `make` needs `PgClient` + `EffectLogger` + `EffectCache`;
  `PgDrizzle.DefaultServices` (= `Layer.merge(EffectCache.Default, EffectLogger.Default)`) supplies
  no-op logger/cache. Logging routes to `Effect.log` via `EffectLogger`.
- **`PgClient` config goes through `@lexiai/config`**, not a raw `Config` call:
  `PgClient.layerConfig({ url: DatabaseUrl })` (the redacted `DatabaseUrl` export). Reading the
  whole `AppConfig` bundle here would force every unrelated key to resolve — take the one config
  you need. The env itself is loaded by `@lexiai/config`'s `ConfigProviderLive` (repo-root
  `.env`), provided at the app entrypoint — see `.claude/rules/config.md`. (DB **tests** bypass
  this layer entirely: they use an ephemeral Testcontainers Postgres — see `@lexiai/database/testing`
  and `.claude/rules/testing.md`.)
- Expose **layers only** (`PgClientLive`, `DBLive`, `DatabaseLive`); `apps/*` compose them with
  **`Layer.provideMerge`**. `repositories/*` `yield*` the `DB` service — **never** a bare
  `drizzle(...)` / `drizzle-orm/node-postgres` driver, and **never** a hand-rolled `PgClient`.

## Idiom adaptation (important — do not copy the docs verbatim)

The docs show `Context.Tag('DB')`. **Adapt to this repo's convention:** class-syntax
**`Context.Service`** (per `.claude/agent-patterns/effect-context-and-layer.md` + effect-smol
`.patterns/effect.md`) and **`Effect.fnUntraced`** for repo methods on hot paths. The integration
moved to **Effect v4 beta in `rc.1`**, and v4 settled on `Context.Service` (not the short-lived
`ServiceMap`), so the `rc`+ API already aligns with this repo — only the published doc pages lag.

## Schema layout & naming

- **One folder per entity:** `database/schema/<entity>/{<entity>.table.ts, <entity>.schemas.ts}`,
  re-exported by `schema/index.ts` (the single `drizzle.config` `schema` entry — a directory
  glob would double-count the barrel's re-exports).
- **Table export suffixed `…Table`** (`wordsTable`), declared with `snakeCase.table` (table-level
  casing; never also set `transformQueryNames`). Each `<entity>.schemas.ts` exports the **row type
  `<Entity>Row`** (`typeof <table>.$inferSelect` — what repos return; preserves jsonb `$type`) and
  the **derived effect/Schemas `<Entity>Schema` / `<Entity>SchemaInsert`** (`createSelectSchema` /
  `createInsertSchema`, for runtime decode). `relations = defineRelations({ wordsTable })` in the
  barrel feeds `PgDrizzle.make`.
- **Enums: never hardcode the value strings.** A `pgEnum` (`asyncJobStatus`) is the single source;
  derive its union type (`type AsyncJobStatus = (typeof asyncJobStatus.enumValues)[number]`) AND a
  native named map (`export const enumAsyncJobStatus = toEnum(asyncJobStatus.enumValues)`, the shared
  helper in `schema/enums.ts`). Reference values by name everywhere — `enumAsyncJobStatus.pending`,
  `enumWordJobStage.fetch_source`, `enumLanguage.en` (in column `.default(…)`, repos, factories,
  seed, and tests) — and use `<enum>.enumValues` for all-values arrays. Keys are derived from the
  pgEnum, never hand-listed; `toEnum` builds the map eagerly at module load (sidestepping the
  `enumValues`-mutates-to-objects runtime quirk, drizzle #2753). The same value-first idiom applies to
  closed string unions nested in jsonb content (`Source.type`, `Frequency.band`, `Visual.kind`): an
  `as const` array is the single source — derive the union from it and feed it to `toEnum` — never a
  `pgEnum` (these aren't columns, so a `CREATE TYPE` would back nothing) and never a re-listed array in
  a factory. `async_word_jobs.stage` IS a column, so it's the `word_job_stage` `pgEnum` (like
  `async_job_status`): `enumWordJobStage.fetch_source` by name, `wordJobStage.enumValues` for arrays.
  Its declaration order is load-bearing — display/pipeline order AND the Postgres sort order
  (`ORDER BY stage` = pipeline order), so reorder it only when reordering the UX stepper.

## Schema derivation — `drizzle-orm/effect-schema`

- Derive row schemas with **`createSelectSchema`** / **`createInsertSchema`** / **`createUpdateSchema`**
  from a table; refine/override columns with `effect/Schema` (pass a column map, or
  `(schema) => schema.check(...)` to refine before nullable/optional is applied). **effect v4 uses
  `.check(Schema.isMinLength(1))`** — not the v3 `.pipe(Schema.minLength(1))`.
- **`$type<T>`**** does NOT survive into the derived effect/Schema** (verified, F-PLAT-005 #11 spike).
  `effect-schema`'s `GetEffectSchemaType` keys off the column's SQL dataType (`json`), not `$type`,
  so a `jsonb().$type<Tiers>()` column becomes the generic `Json` union on `createSelectSchema`
  (`string | number | boolean | null | {} | []`), regardless of `$type`. (Source:
  `repos/drizzle/drizzle-orm/src/effect-schema/column.types.ts` — `'json' → jsonSchema`.) So
  `<Entity>Schema` hands consumers **opaque jsonb**. This is exactly why the naming splits: **(a)**
  the **`<Entity>Row`** type (`typeof <table>.$inferSelect`) **does** carry `$type`, so repos return
  it for compile-time-typed columns with no runtime decode; **(b)** for runtime validation of
  untrusted JSON (e.g. LLM output at a write boundary), hand-author an `effect/Schema` for that
  column — neither `<Entity>Schema` nor `<Entity>Row` enforces the jsonb shape at runtime.

## Schema-boundary rule (hard constraint)

`effect-schema`-generated schemas `import 'drizzle-orm'`, so they live in **`database/`
(backend-only)**. `@lexiai/schemas` is **isomorphic — `effect` only** (per
`packages/schemas/CLAUDE.md` + `.claude/rules/dependency-hierarchy.md`): **never** import
`drizzle-orm` there. If the frontend needs a shape, **hand-author a plain `effect/Schema`** in
`@lexiai/schemas`, decoupled from the Drizzle table.

## Lifecycle entities — permissive row → strict contract

For tables with a generation/status lifecycle (e.g. `words` with
`status: pending | ready | failed`), the content columns are **nullable in storage**
because a `pending` row exists *before* its content does. Do **not** chase `NOT NULL` on
those columns, and do **not** hand consumers the raw nullable `createSelectSchema` row —
that leaks optional fields that are actually *required once `ready`*. Instead, **separate
storage permissiveness from contract precision** in two layers:

1. **Storage row** (`createSelectSchema(table)`) — permissive, nullable content. Internal
   to `database/` / `repositories/*`; never the public shape.
2. **Domain contract** — a **discriminated union** decoded *from* the row, which **enforces
   the invariant at decode time** (a `ready` row missing content fails to decode). Verified
   Effect v4 tools: `Schema.TaggedUnion({...})` (or `Schema.toTaggedUnion('_tag')`) with
   `.match` / `.guards`; bridge the row→union with `Schema.decodeTo(Union,
   Schema.transformOrFail({ decode, encode }))`; distinguish `Schema.NullOr` vs
   `Schema.optional` / `Schema.optionalKey`; assert cross-field rules with
   `.check(Schema.makeFilter(...))`. Cheat-sheet has the worked snippet.

**Strongest storage variant (as-built for `words`, F-PLAT-005 §v7):** push the lifecycle
*out* of the entity entirely. `words` is **pristine** — all generation content merged in
`NOT NULL` (except a nullable `frequency`), no `status`, so **a `words` row exists ⇔ the word
is ready**. There is no detail table and no nullable content: transient partial state lives in
`async_word_jobs.result` (jsonb, one row per stage) during generation and is **assembled + decoded
through a real `effect/Schema`** before the promotion upsert. So `words` never holds half a word, and the
permissive-row → strict-union dance above is unnecessary for it (it remains the right tool for a
table that genuinely *must* store a pre-ready row).

> **Decision (F-PLAT-005 §v7, supersedes the F-PLAT-004 plan):** `WordsRepo` hands back the
> plain `WordRow` (`$inferSelect`) — already complete, no union/decoder needed — and `create`
> is the single promotion **upsert** on `UNIQUE(word, language)` (first-gen inserts, regen replaces).
> The earlier plan's 1:1 `word_details` split (and the nullable-row union) was dropped in favour of this merge.

## Version floor

`drizzle-orm@1.0.0-rc` (**≥ `1.0.0-rc.1`** — first release whose `effect-schema`/`effect-postgres`
are **native Effect v4 beta**, fixes drizzle [#5414](https://github.com/drizzle-team/drizzle-orm/issues/5414);
the `beta.15`–`beta.21` line is Effect **v3** — do not cite it). Vendored at `v1.0.0-rc.3`;
catalog `db` is pinned to `1.0.0-rc.3` to match (bumped in F-PLAT-004/T01), and the concrete
`DBLive` / `DatabaseLive` layers live in `database/src/db.ts` (F-PLAT-004/T03).

## Avoid

- A bare `drizzle(...)` / `drizzle-orm/node-postgres` driver, or a hand-rolled `PgClient`, in
  `repositories/*`. Go through the `effect-postgres` layer.
- `import 'drizzle-orm'` (or a generated row-schema) anywhere under `@lexiai/schemas`.
- The v3-era idiom from web docs (`@effect/sql-drizzle`, `Context.Tag('DB')`). Read the vendored
  `rc` source for exact signatures.
