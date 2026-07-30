---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming conventions

File/symbol conventions here are NOT linted (Biome has no filename or symbol-name rule) — they are
the convention.

## Packages

Seven workspaces: `apps/{api,worker}` → `@kotodama/app-{api,worker}` (apps drop the plural); the two
**aggregate** packages `@kotodama/core` + `@kotodama/platform`, which expose layer/adapter folders as
**subpath exports**, not dash-flattened packages (`core/words` → `@kotodama/core/words`,
`core/repositories/words` → `@kotodama/core/repositories`; `platform/config` →
`@kotodama/platform/config`); plus standalone `@kotodama/database`, `@kotodama/infra`, and
`@kotodama/presets` (at `infra/presets/`).

## Files

- **All source files are `kebab-case`**, whatever they export (`config-provider-live.ts` exports
  `ConfigProviderLive`).
- **Files carry one dotted role suffix `<name>.<role>.ts`** — the fast index into a layer:

  | Suffix | Role | Layer |
  |---|---|---|
  | `.service.ts` | a `Context.Service` (or its concrete/mock `Layer`) | `core/**`, `platform/**` |
  | `.use-case.ts` | a user-flow composer function | `core/use-cases/**` |
  | `.repo.ts` | bare persistence functions (`selectX`/`upsertX`) | `core/repositories/**` |
  | `.schema.ts` | other `effect/Schema` definitions | `core/**` |
  | `.api.ts` / `.handler.ts` | an `HttpApi` contract / its handler bindings | `apps/api/**` |
  | `.view.ts` / `.model.ts` | computed view model (edge) / read model (core) — no backing row | edge / `core/**` |
  | `.entity.ts` / `.table.ts` / `.values.ts` / `.enums.ts` | storage schemas / table / value tuples / `pgEnum`s | `database/**` |
  | `*.factory.ts` | test-data factories | `database/src/factories/` |

  A file playing none of these roles stays a bare kebab name. Tests mirror the source, suffix
  included (`words.repo.test.ts`), in the workspace's `test/`.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries).
- `database/schema/` groups one folder per repository boundary (named to match the repo folder),
  plus domain-neutral `primitives/` (shared value vocabularies) and `utils/` (internal build
  helpers); the `schema/index.ts` barrel re-exports every group. See `database/CLAUDE.md`.

## Symbols

- **Every identity-bearing symbol (DI tags + domain types) ends in a role-noun `<Domain><Role>`** —
  most precise role, `Service` only as fallback. Two exemptions: `DB` (primitive infra handle), and
  the one bare-named schema per aggregate — the status-keyed domain union (`Word = ReadyWord |
  UnreadyWord`, leaves `<State><Domain>`).
- **Never suffix a symbol `<X>Schema`** — schema-ness is the file's `.schema.ts` role; const + type
  share one name.
- **Functions are verb-first, role-noun-free; the verb vocabulary is the layer marker:**
  - **Persistence** uses a DB verb (`select`/`insert`/`update`/`upsert`/`delete`/`search`) + domain:
    `selectWords`, `upsertWord`, `searchWords` (filtered/ordered/paged read). No `Repo` symbols —
    repos are bare functions. (`selectWordCounts` = an aggregate read; name mirrors its `WordCounts`
    return, stays role-noun-free.)
  - **Core logic & app-flows** use a domain verb (`find`/`get`/`ensure`/`collapse`/`assemble`/
    `build`/`request`): `ensureWordBuildable`, `requestWordBuild`. Verb alone tells you the layer.
- **Role vocabulary** (a precise role *replaces* `Service`, never stacks):
  - Behavior: `Client` (external-API adapter) · `Engine` (pluggable swap boundary) · `Store`/`Queue`
    (bound-resource wrappers) · `Service` (catch-all). A concrete layer adds `Live`, one per boundary.
  - Data: `Entity`/`EntityInsert` (**all storage vocab — rows AND jsonb content shapes — authored in
    `database/`**) · `Row` (`$inferSelect`, from the table file — trusted-read return) · `View`/`Model`
    (computed, no backing row) · `Content` · `Message` · `Error`. Value tuples (`Language`,
    `AsyncJobStatus`) stay bare. A 1:1 projection earns `.model.ts`/`.view.ts` only when it truly
    *transforms* storage (e.g. presigned URLs) — otherwise consume `database/` rows directly.
  - **Repo I/O shapes are `<Entity><Role>`, `<Entity>` singular**, role keyed to the verb that
    eats/emits them: `Query` (`select*` filter) · `SearchQuery` (`search*` filter + paging) ·
    `SearchResult` (`items` + `total`) · `Upsert` (`upsert*` payload) · `Counts` (per-status
    aggregate). Never name an `upsert` payload `Content`.

## Order & Effect

- **File-internal order:** vocabulary → behaviour, exported main function/service last. Two hard
  overrides: definition-before-use always wins (runtime `const` doesn't hoist — a layer before its
  dependency is a TDZ `ReferenceError`, so layer files compose bottom-up:
  `PgClientLive → DBLive → DatabaseLive`); a `Context.Service` file reads Shape → tag → helpers → `*Live`.
- **Effect:** `Context.Tag`/`Service` ids are slash-namespaced (`"@kotodama/core/content/ContentEngine"`);
  tagged errors are `PascalCase…Error`. (Whether a symbol deserves a service at all, and where
  `*Live`s are provided/faked: `effect-conventions.md`.)
