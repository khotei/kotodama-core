# Naming conventions

## Packages

Six workspaces: `apps/{api,worker}` (apps drop the plural → `@kotodama/app-api`,
`@kotodama/app-worker`), the two aggregate packages **`@kotodama/core`** and
**`@kotodama/platform`**, plus the standalone **`@kotodama/database`**, `@kotodama/infra` and
`@kotodama/tooling`. `core` and `platform` expose their layer/adapter folders as **subpath exports**,
not separate dash-flattened packages: `core/words` → `@kotodama/core/words`,
`core/repositories/words` → `@kotodama/core/repositories`; `platform/config` →
`@kotodama/platform/config`, `platform/ai` → `@kotodama/platform/ai`. `database` stays a normal
top-level package (`@kotodama/database`) — its drizzle/migration tooling earns the boundary.

## Files

- **All source files are `kebab-case`**, whatever they export (`config-provider-live.ts` exports
  `ConfigProviderLive`; `db.ts` exports `DB`/`DatabaseLive`).
- **Files carry a dotted role suffix — `<name>.<role>.ts`** — one role per file, the fast index
  into a layer:

  | Suffix | Role | Layer |
  |---|---|---|
  | `.service.ts` | a `Context.Service` (or its concrete/mock `Layer`) | `core/**`, `platform/**` |
  | `.use-case.ts` | a user-flow composer function | `core/use-cases/**` |
  | `.repo.ts` | bare persistence functions (`selectX`/`upsertX` — not a service, not a namespace object) | `core/repositories/**` |
  | `.schema.ts` | other `effect/Schema` definitions (results, messages) | `core/**` |
  | `.api.ts` / `.handler.ts` | an `HttpApi` contract / its handler bindings | `apps/api/**` |
  | `.view.ts` / `.model.ts` | a computed view model (presentation edge) / read model (core) — no backing row | edge / `core/**` |
  | `.entity.ts` / `.table.ts` / `.values.ts` / `.enums.ts` | storage schemas / table / value tuples / derived `pgEnum`s | `database/**` |
  | `*.factory.ts` | test-data factories | `database/src/factories/` |

  A file playing none of these roles — a plain helper, mock data, or pure logic/orchestration
  (plain `Effect.fnUntraced` functions, not services) — stays a bare kebab-case name. Tests mirror
  the source they cover, suffix included (`words.repo.test.ts`), in the workspace's `test/` folder.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries).
- `database/schema/` groups by aggregate/domain (one folder per repository boundary, named to
  match the repo folder); cross-domain helpers stay at the `schema/` root; the barrel
  `schema/index.ts` re-exports every group. Details: `database/CLAUDE.md`.

## Symbols

**Every identity-bearing symbol (DI tags + domain types) ends in a role-noun — `<Domain><Role>`,
the most precise role, `Service` only as fallback.** Two exemptions: `DB` (a primitive infra handle
à la Effect's `FileSystem`), and the one bare-named schema per aggregate — the status-keyed domain
union (`Word = ReadyWord | UnreadyWord`, leaves are `<State><Domain>`); every other word shape
carries its role noun, so the bare name is unambiguous by elimination. **Never suffix a symbol
`<X>Schema`** — schema-ness is the *file's* `.schema.ts` role; the const and its type share one name.

**Functions are verb-first and role-noun-free, and the verb vocabulary is the layer marker:**

- **Persistence ops use a DB verb** — `select`/`insert`/`update`/`upsert`/`delete`/`search`
  + domain: `selectWords`, `upsertWord`, `searchWords` (a filtered/ordered/paged read),
  `selectWordCounts` (an aggregate read — a `select*` whose name mirrors its `WordCounts` return
  shape, just as `selectWord` returns a `Word`, so it stays role-noun-free, not `count*`). The DB
  verb says "raw `core/repositories/**` layer". No `Repo` symbols — repos are bare exported functions.
- **Core logic & app-flows use a domain verb** — `find`/`get`/`ensure`/`collapse`/`assemble`/
  `build`/`request`: `ensureWordBuildable`, `requestWordBuild`. The partition kills collisions —
  the verb alone tells you the layer, no namespace prefix needed.

**Role vocabulary** (a precise role *replaces* `Service`, never stacks with it):

- Behavior: `Client` (external-API adapter) · `Engine` (pluggable swap boundary) · `Store`/`Queue`
  (bound resource wrappers) · `Service` (the catch-all). A concrete layer adds `Live` — one per
  boundary service; `*Default` is retired. Don't collapse a precise role into `Service`:
  `ContentEngine`/`WikiClient` are correct as-is (Effect idiom — `HttpClient`, not
  `HttpClientService`).
- Data: `Entity`/`EntityInsert` (**all storage vocabulary, authored in `database/`** — row schemas
  AND the jsonb content shapes, so a database-authored shape is name-distinguishable from a core
  business shape) · `Row` (`$inferSelect`, exported from the table file — what repos return on
  trusted reads; `Entity` is the runtime schema for write/untrusted boundaries) · `View`/`Model`
  (computed shape with no backing row, at the edge / in core; leaf payloads derive from the
  entities so they can't drift) · `Content` · `Message` · `Error`. Value tuples (`Language`,
  `AsyncJobStatus`) stay bare — shared vocabulary, not structs.
- A 1:1 per-row projection earns a `.model.ts`/`.view.ts` only when it truly *transforms* storage
  (e.g. presigned URLs) — an alias or a bare field-hide does not; backend code otherwise consumes
  the `database/` rows/entities directly.
- **Repo I/O shapes are `<Entity><Role>`, the role keyed to the `select`/`search`/`upsert`
  verb that eats or emits them** — so the type name alone says which repo call it belongs to:
  `Query` (a `select*` filter — `WordQuery`, `AsyncWordJobQuery`) · `SearchQuery` (a
  `search*` filter + paging — `WordSearchQuery`) · `SearchResult` (a `search*` return: `items` +
  `total` — `WordSearchResult`) · `Upsert` (an `upsert*` payload — `WordUpsert`, `AsyncWordJobUpsert`;
  a `stagePatch`-style builder that *constructs* one keeps its own verb name) · `Counts` (a
  per-status aggregate — `WordCounts`). The `<Entity>` is **singular** (`WordQuery`, not
  `WordsQuery`) though the function pluralizes (`selectWords`/`searchWords`); `Row` stays the
  trusted-read return. Never name an `upsert` payload `Content` — that role is the
  `database/`-authored jsonb shape.

## File-internal order

Top-to-bottom from vocabulary to behaviour, each kind grouped: imports → identity-bearing
declarations (errors, schemas, exported types) → module constants → private helpers → **the
exported main function/service last**. Two hard overrides: definition-before-use always wins
(runtime `const` doesn't hoist — a layer declared before its dependency is a TDZ
`ReferenceError`, which is why layer files compose bottom-up: `PgClientLive → DBLive →
DatabaseLive`); and a `Context.Service` file reads Shape → tag → helpers → `*Live` last.

## Effect

- `Context.Service`/`Context.Tag` ids are slash-namespaced to the package:
  `Context.Tag<ContentEngine>("@kotodama/core/content/ContentEngine")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: one `*Live` per boundary service — the swappable client/config rides the service's `R`
  channel, is provided at the app entrypoint, and is faked in tests.
