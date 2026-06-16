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
  | `.service.ts` | a `Context.Service` (or its concrete/mock `Layer`) | `core/**` | `word-finder.service.ts`, `mock-content-engine.service.ts` |
  | `.repo.ts` | a repository `Context.Service` | `repositories/**` | `words.repo.ts` |
  | `.schema.ts` | other `effect/Schema` definitions (results, messages — not a model) | `core/**` | `build-outcome.schema.ts` |
  | `.api.ts` | an `HttpApi` contract | `apps/api/**` | `words.api.ts` |
  | `.handler.ts` | the `HttpApiBuilder` handlers for a contract | `apps/api/**` | `words.handler.ts` |
  | `.model.ts` | a computed **read model** — no backing row (see below) | `core/**` | `word-state.model.ts` |
  | `.entity.ts` | a persistence `<Name>Entity` | `database/**` | `words.entity.ts` |

  `database/schema/` adds its own table-vocabulary roles (`.table.ts`, `.content.ts`, `.values.ts`,
  `.enums.ts` — see below); `database/src/factories/*.factory.ts` for test
  factories. A file that plays none of these roles (a plain helper, mock data, a normalizer) stays a
  bare kebab-case name — `word-input.ts`, `mock-content.ts`. Tests mirror the source they cover, suffix
  included: `word-finder.service.test.ts`, `words.repo.test.ts`.
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
    trusted reads (no decode); it flows through core services as-is (`WordFinder.find` returns
    `Option<WordRow>`). `Entity` is the runtime schema; reach for it at write/untrusted boundaries.
  - **Read model** (`<Name>Model`, e.g. `word-state.model.ts` → `WordStateModel`) — the only `.model.ts`
    role: a *computed* domain shape with **no backing row**, assembled across rows + a **synthesized
    discriminant** (`succeeded|running|failed`, which no column stores). Its **leaf payloads derive
    from entities / content schemas** so they can't drift — `WordStateModel.succeeded` carries
    `WordEntity`; `StageProgress = AsyncWordJobEntity.pick(['stage','status'])`;
    `JobErrorView = JobError.omit(['cause'])` — only the discriminant + assembly are hand-authored.
    A 1:1 per-row model (the old `WordModel`/`AsyncWordJobModel`) earns a `.model.ts` only when it
    truly *transforms* storage (e.g. presigned URLs) — an alias or a bare field-hide does not.
- **`database/schema/` groups by aggregate/domain, not by table** — one folder per
  repository boundary, named to match the repo package (plural). `schema/words/`
  holds the pristine `words` (owned by `WordsRepo`); `schema/async-word-jobs/`
  holds `async_word_jobs` (owned by `AsyncWordJobsRepo`) — **one row per `(word, language, stage)`**,
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

> Filenames stay kebab-case even for `PascalCase` exports (Services/Layers/Schemas) and
> `camelCase` helpers — so a `WordsRepo` service lives in `words.repo.ts`, a `mapRow` helper in
> `map-row.ts`. The symbol names (not the files) carry the `PascalCase` / `camelCase` distinction.

## Effect

- `Context.Service` / `Context.Tag` identifiers use the **slash-namespaced** string id matching the package, e.g. `Context.Tag<WordsRepo>("@lexiai/repositories-words/WordsRepo")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: `<Service>Live` / `<Service>Default` for the concrete layer.
