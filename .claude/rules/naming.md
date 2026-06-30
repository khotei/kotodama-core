# Naming conventions

## Packages

`@lexiai/<folder>` — nested folders flatten with a dash:

| Folder | Package name |
|---|---|
| `packages/schemas` | `@lexiai/schemas` |
| `core/words` | `@lexiai/core-words` |
| `repositories/words` | `@lexiai/repositories-words` |
| `repositories/async-word-jobs` | `@lexiai/repositories-async-word-jobs` |
| `packages/utils` | `@lexiai/utils` |
| `database` | `@lexiai/database` |
| `apps/api` | `@lexiai/app-api` |
| `apps/web` | `@lexiai/app-web` |

## Files

- **All source files are `kebab-case`** (lowercase, dash-separated) — regardless of what they
  export. The filename describes the contents; the exported symbol keeps its own casing in code.
  Examples: `config-provider-live.ts` exports `ConfigProviderLive`; `db.ts` exports
  `DB` / `DatabaseLive`; `tracing.ts` exports `TracingLive`; `words.table.ts` exports `wordsTable`.
  Single-word files stay single-word (`db.ts`, `tracing.ts`).
- **Files carry a dotted role suffix — `<name>.<role>.ts` — naming what the file *is*, one role per
  file.** The suffix is the fast index into a layer: the same role always reads the same. Canonical roles:

  | Suffix | Role | Layer | Example |
  |---|---|---|---|
  | `.service.ts` | a `Context.Service` (or its concrete/mock `Layer`) | `core/**` | `content-engine.service.ts`, `mock-content-engine.service.ts` |
  | `.use-case.ts` | a user-flow composer **function** (the top tier — `requestWordBuild`, `buildWord`) | `use-cases/**` | `word-build.use-case.ts` |
  | `.repo.ts` | the repository's **bare persistence functions** (`selectX` / `upsertX` — not a `Context.Service`, not a namespace object) | `repositories/**` | `words.repo.ts` |
  | `.schema.ts` | other `effect/Schema` definitions (results, messages — not a model) | `core/**` | `build-outcome.schema.ts` |
  | `.api.ts` | an `HttpApi` contract | `apps/api/**` | `words.api.ts` |
  | `.handler.ts` | the `HttpApiBuilder` handlers for a contract | `apps/api/**` | `words.handler.ts` |
  | `.view.ts` | a computed **view model** — no backing row, at the presentation edge (see below) | API edge | `apps/api/src/words/word-state.view.ts` |
  | `.model.ts` | a computed **read model** — no backing row, core-tier variant of the above | `core/**` | _(none live; see below)_ |
  | `.entity.ts` | a persistence `<Name>Entity` | `database/**` | `words.entity.ts` |

  `database/schema/` adds its own table-vocabulary roles (`.table.ts`, `.content.ts`, `.values.ts`,
  `.enums.ts` — see below); `database/src/factories/*.factory.ts` for test
  factories. A file that plays none of these roles (a plain helper, mock data, a normalizer, or a piece
  of **pure logic / orchestration** — `ensureWordBuildable`, `assembleWord`, which are
  plain `Effect.fnUntraced` functions, **not** services — see the
  "Service vs plain function" rule in `effect-conventions.md`) stays a bare kebab-case name —
  `word-finder.ts`, `word-assembler.ts`, `word-input.ts`, `mock-content.ts`. (The app-flow composers in
  `use-cases/**` are also bare functions, but keep the `.use-case.ts` suffix as their layer index.) Tests
  mirror the source they cover, suffix included: `word-build.use-case.test.ts`, `words.repo.test.ts`.
  > **Every *identity-bearing* symbol ends in a role-noun: `<Domain><Role>` — pick the *most precise*
  > role, with `Service` as the fallback.** Identity-bearing = DI tags + domain types. The whole codebase
  > obeys it — only `DB`, a primitive infra handle à la Effect's `FileSystem`, is exempt. `Word` lives in
  > many roles at once (`WordEntity` / `WordRow` / `WordContent` / `WordStateView` / `WordsQuery` / …), so
  > a bare `Word` would collide and blur data vs behavior. **Functions are the exception — every function
  > is verb-first and role-noun-free**, whatever its layer.
  >
  > **The verb vocabulary is the layer marker** (no namespace object, no `Repo` symbol — repos are bare
  > exported functions):
  > - **Persistence ops use a DB verb** — `select` / `insert` / `update` / `upsert` / `delete` — carrying
  >   the domain in the name: `selectWords`, `selectWord`, `upsertWords`, `selectWordJobStages`,
  >   `upsertWordJobStages`. The DB verb says "this is the raw `repositories/**` layer." (One documented
  >   exception to "DB verb ⇒ raw rows": `selectWord` returns `Option<WordRow>` — the single-word
  >   convenience read, kept beside `selectWords` by user decision; see `repositories/words/CLAUDE.md`.)
  > - **Core logic & app-flows use a domain verb** — `find` / `get` / `ensure` / `collapse` / `assemble` /
  >   `build` / `request`: `ensureWordBuildable`, `collapseWordState`, `assembleWord`,
  >   `requestWordBuild`, `buildWord`. The domain verb says "this is `core/**` / `use-cases/**`."
  > - **The partition kills collisions:** the verb itself tells you the layer, so `selectWords` (raw
  >   `repositories/**`) ≠ `requestWordBuild` (the `use-cases/**` flow) by construction — no namespace
  >   prefix needed. Discoverability is grep on the name + the `*.repo.ts` file.
  >
  > **The role vocabulary (for the identity-bearing symbols — a precise role *replaces* `Service`, never
  > stacks with it):**
  > - Behavior tags: `Client` (external-API adapter) · `Engine` (a pluggable pipeline / swap boundary) ·
  >   **`Service`** (any other in-app domain service — the catch-all `Context.Service`). A concrete layer
  >   adds `Live` (one per boundary service — `Default` is retired; see the Effect section). (`Repo` and
  >   `UseCase` are **retired** as role-nouns — persistence and
  >   app-flows are bare functions now, marked by their verb, not a tag.)
  > - Data: `Entity` / `EntityInsert` · `Row` · `View` (computed view model, edge) / `Model` (its core-tier read-model variant) · `Content` · `Message` ·
  >   `Error`.
  >
  > So `ContentEngine` and `WikiClient` are **correct as-is** — `Engine`/`Client` say more than `Service`
  > would; collapsing a precise role into `Service` is information loss and against Effect idiom
  > (`HttpClient`, not `HttpClientService`). The boundary adapters carry their own precise roles too:
  > `StorageClient` / `QueueClient` (the SDK-owning bases — `Client`) and `ImagesStore` / `JobsQueue`
  > (the bound wrappers — `Store` / `Queue`, the thing each *is*), none taking `Service`. A
  > `Context.Service` tag id mirrors the symbol: `@lexiai/<pkg>/<Domain><Role>`. Don't normalize
  > everything to `Service`, and don't drop the role-noun.
- **`database/` rows + entities are the single per-row shape — there is no per-row "model".**
  `database/` authors the word vocabulary and the persistence schemas; backend code consumes them
  directly (no per-call projection — Schema encoding at a contract already drops non-schema keys):
  - **`<Name>Entity`** (database, `<entity>.entity.ts`) — the row as a runtime schema:
    `createSelectSchema(table, { …jsonb overrides })`, where the overrides are the authored content
    schemas (so jsonb columns are typed, not opaque `Json`). Carries the storage envelope (`id`,
    timestamps, + per-table internal columns like `words.sourceVersions`)
    + content. Both `words` and `async_word_jobs` have one (+ a `<Name>EntityInsert` for the write
    boundary). API contracts compose it for per-row payloads (`success: Schema.NullOr(WordEntity)`).
  - **`<Name>Row`** (`$inferSelect`, from the table file) — the compile-time row type repos return for
    trusted reads (no decode); it flows through reads as-is (`selectWord` returns
    `Option<WordRow>`). `Entity` is the runtime schema; reach for it at write/untrusted boundaries.
  - **View / read model** (`<Name>View` at the presentation edge, `<Name>Model` in core, e.g.
    `WordStateView` in `apps/api/src/words/word-state.view.ts`) — a *computed* domain shape with **no
    backing row**, assembled across rows + a **synthesized discriminant** (`succeeded|running|failed`,
    which no column stores). A *view* model like this lives at the layer that assembles it — when that is
    the API edge it takes the `.view.ts`/`View` role (presentation), not `core/`'s `.model.ts`/`Model`.
    Its **leaf payloads derive from entities / content schemas** so they can't drift —
    `WordStateView.succeeded` carries `WordEntity`; `StageProgress = AsyncWordJobEntity.pick(['stage','status'])`;
    `JobErrorView = JobError.omit(['cause'])` — only the discriminant + assembly are hand-authored.
    A 1:1 per-row model (the old `WordModel`/`AsyncWordJobModel`) earns a `.model.ts` only when it
    truly *transforms* storage (e.g. presigned URLs) — an alias or a bare field-hide does not.
- **`database/schema/` groups by aggregate/domain, not by table** — one folder per
  repository boundary, named to match the repo package (plural). `schema/words/`
  holds the pristine `words` (owned by `repositories/words`); `schema/async-word-jobs/`
  holds `async_word_jobs` (owned by `repositories/async-word-jobs`) — **one row per `(word, language, stage)`**,
  `StageState` flattened into columns, not a `payload` jsonb. A domain with a single table is just a
  one-table folder. Cross-domain helpers (`columns.ts`, `to-enum.ts`, `language.ts` — `timestampColumns`,
  `languageEnum`/`LANGUAGES`/`Language`) stay at the `schema/` root; per-domain symbols live in the
  folder under a role suffix: `<entity>.content.ts` (authored content effect-schemas + `<entity>.Type`
  the table's `$type` reads — e.g. `async-word-jobs`' `StageResult`/`JobError`), `<entity>.values.ts`
  (value tuples + `Schema.Literals` + `toEnum` maps), `<entity>.enums.ts` (the `pgEnum`s derived from
  those tuples), `<entity>.entity.ts` (`<Name>Entity` + `<Name>EntityInsert`). `<Entity>Row`
  (`$inferSelect`) is exported from the table file. The barrel `schema/index.ts` re-exports every group
  + the `relations`.
- **Tests:** `*.test.ts` in the workspace's `test/` folder (sibling of `src/`, mirroring its structure) — not colocated with source. See `.claude/rules/testing.md`.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries — the package `exports` entry).

> Filenames stay kebab-case even for `PascalCase` exports (Services/Layers/Schemas) and `camelCase`
> exports — so the persistence functions `selectWords`/`upsertWords` live in `words.repo.ts`, a `mapRow`
> helper in `map-row.ts`. The symbol names (not the files) carry the `PascalCase` / `camelCase`
> distinction.

## Effect

- `Context.Service` / `Context.Tag` identifiers use the **slash-namespaced** string id matching the package, e.g. `Context.Tag<ContentEngine>("@lexiai/core-content/ContentEngine")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: **one `*Live` per boundary service** (`WikiClientLive`, `StorageClientLive`) — the swappable
  client/config rides the service's `R` channel, is provided at the app entrypoint, and is faked in
  tests. `*Default` is **retired** as the default concrete-layer suffix; reserve it only for a future
  genuine multi-impl default (a service that ships two real layers and names one the default).
