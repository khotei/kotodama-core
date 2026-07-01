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

## Reach for the Postgres primitive first (capability sweep)

Before hand-writing a **loop over rows, a second query per row, a manual aggregate/dedup/collapse, a
running total, or a slow `LIKE '%…%'`** in application code, check whether Postgres does it in one
construct — pushing a *data-shape* concern into the engine is the deep-module move (a whole class of
app-side loops disappears behind a narrow typed repo function or a `pgView`). The recognition map
(symptom → primitive), each item grounded in the lexi-ai schema with its Drizzle expression and a docs
citation, is **`.claude/agent-patterns/postgres-capabilities.md`** — the SQL sibling of the
`effect-stdlib` / `type-fest` catalogs. Consult it when writing any non-trivial query (the taste gate
in `.claude/rules/deep-modules.md` still governs — don't cargo-cult a feature where a plain query is
clearer).

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

- **One folder per entity:** `database/schema/<entity>/` (`<entity>.table.ts`, plus role files —
  see `naming.md`), re-exported by `schema/index.ts` (the single `drizzle.config` `schema` entry —
  a directory glob would double-count the barrel's re-exports).
- **Table export suffixed `…Table`** (`wordsTable`), declared with `snakeCase.table` (table-level
  casing; never also set `transformQueryNames`). The table file also exports the **row type
  `<Entity>Row`** (`typeof <table>.$inferSelect` — what repos return; preserves jsonb `$type`).
  `relations = defineRelations({ wordsTable })` in the barrel feeds `PgDrizzle.make`.
- **Enums & value lists: never hardcode the value strings — a value tuple is the single source.**
  An `as const` tuple defines the values once; everything derives from it: the union type
  (`type AsyncJobStatus = (typeof ASYNC_JOB_STATUSES)[number]`), the named map
  (`enumAsyncJobStatus = toEnum(ASYNC_JOB_STATUSES)` — `toEnum` lives in `@lexiai/schemas`), the
  `pgEnum` when a column backs it (`pgEnum('async_job_status', ASYNC_JOB_STATUSES)`), and any
  `Schema.Literals(TUPLE)`. **All vocabulary is authored in `database/`** (`toEnum` is the shared
  helper at `schema/to-enum.ts`): content-language `LANGUAGES` in `schema/language.ts`, word value lists
  (`VISUAL_KINDS`, `SOURCE_TYPES`, `FREQUENCY_BANDS`) in `schema/words/words.values.ts`,
  build-machinery (`WORD_JOB_STAGES`, `ASYNC_JOB_STATUSES`, `JOB_ERROR_TYPES`) in
  `schema/async-word-jobs/async-word-jobs.values.ts`. `core/` derives its literal schemas from these
  tuples (e.g. `WordState`). Reference values by name everywhere —
  `enumAsyncJobStatus.pending`, `enumLanguage.en` (in column `.default(…)`, repos, factories, seed,
  and tests) — and use the tuple for all-values arrays. `toEnum` builds the map eagerly at module
  load (sidestepping the `enumValues`-mutates-to-objects runtime quirk, drizzle #2753); derive from
  the tuple, never from a `pgEnum` object. A jsonb-nested union (`Source.type`, `JobError.type`)
  gets NO `pgEnum` (no column backs it — a `CREATE TYPE` would back nothing). `WORD_JOB_STAGES`'
  declaration order is load-bearing — display/pipeline order AND the Postgres sort order
  (`ORDER BY stage` = pipeline order), so reorder it only when reordering the UX stepper.

## Entities: `createSelectSchema` WITH jsonb overrides (`<Name>Entity`)

A **bare** `createSelectSchema(table)` is unfit: `$type<T>` does NOT survive derivation (verified,
F-PLAT-005 #11 spike) — `GetEffectSchemaType` keys off the column's SQL dataType (`json`), not
`$type`, so `jsonb().$type<Tiers>()` becomes the opaque `Json` union (source:
`repos/drizzle/drizzle-orm/src/effect-schema/column.types.ts` — `'json' → jsonSchema`). That is why
the old un-refined `<Entity>Schema`/`<Entity>SchemaInsert` exports were deleted.

The fix is the **refine map**: pass the authored content schema for each jsonb column, and
`createSelectSchema` *replaces* the column schema with it (runtime: `effect-schema/schema.ts`;
types: `BuildSchema` → `HandleRefinement`). So `WordEntity = createSelectSchema(wordsTable, { tiers:
Tiers, …, frequency: Schema.NullOr(Frequency) })` is a fully-typed runtime row schema. A bare-schema
override owns its own nullability (column nullability is *not* auto-applied — wrap nullable columns
in `Schema.NullOr` yourself); a function refinement (`word: (s) => s.check(Schema.isMinLength(1))`)
*does* get the column's nullability. Author the content effect-schemas in `<entity>.content.ts`; the
table reads each `$type` from `typeof X.Type` and the entity overrides the same columns with `X`.

Reads still use the **`<Entity>Row`** type (`$inferSelect`, trusted DB data, no decode); the `Entity`
schema earns its keep as (a) the per-row payload the API contracts compose (and the derivation source
for core's read-model leaves) and (b) the validated shape at write/untrusted boundaries
(`assembleWord` decodes assembled LLM output through `WordEntityInsert`). **Every entity is
authored the same way** — `words` and `async_word_jobs` both have a
`<entity>.content.ts` (authored content schemas) + `<entity>.entity.ts` (`<Name>Entity` +
`<Name>EntityInsert`). `async_word_jobs`' `result` is an
open `Schema.Record(String, Unknown)` (heterogeneous per stage, decoded to a concrete subshape only when
the worker assembles the `words` row); `error` is the typed `JobError`. The row type
(`AsyncWordJobRow`) is still what the repo returns on trusted reads.

## Schema-boundary rule (hard constraint)

Shape knowledge is authored at the **bottom** and flows up: `database/` authors the content
effect-schemas, value tuples/`pgEnum`s, and `WordEntity`; `core/` consumes them directly
(`core → database`, a legal downward edge); the consuming layers author only computed view/read models (`WordStateView`);
the API contract composes both. There is **one author per shape** and no cycle.
`database/` may import `drizzle-orm` (it is backend persistence); the FE has no vocabulary package
(`packages/schemas` was deprecated) — its contract surface is re-established when the UI returns.

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
   `.check(Schema.makeFilter(...))`. Cheat-sheet has the worked snippet. Under the
   `patchOnConflict` upsert (`database/src/on-conflict.ts`) the choice is load-bearing:
   `Schema.NullOr` always carries its key, so "no data" decodes to an explicit `null` and
   **clears** the stored column — express "absent = keep" with `Schema.optionalKey`, never
   by passing `null`.

**Strongest storage variant (as-built for `words`, F-PLAT-005 §v7):** push the lifecycle
*out* of the entity entirely. `words` is **pristine** — all generation content merged in
`NOT NULL` (except a nullable `frequency`), no `status`, so **a `words` row exists ⇔ the word
is ready**. There is no detail table and no nullable content: transient partial state lives in
`async_word_jobs.result` (jsonb, one row per stage) during generation and is **assembled + decoded
through a real `effect/Schema`** before the promotion upsert. So `words` never holds half a word, and the
permissive-row → strict-union dance above is unnecessary for it (it remains the right tool for a
table that genuinely *must* store a pre-ready row).

> **Decision (F-PLAT-005 §v7, supersedes the F-PLAT-004 plan):** `selectWords` hands back the
> plain `WordRow` (`$inferSelect`) — already complete, no union/decoder needed — and `upsertWords`
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
