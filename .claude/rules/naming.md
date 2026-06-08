# Naming conventions

## Packages

`@lexiai/<folder>` — nested folders flatten with a dash:

| Folder | Package name |
|---|---|
| `packages/schemas` | `@lexiai/schemas` |
| `packages/http` | `@lexiai/http` |
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
- **Multi-file entities** use a dotted role suffix — `<entity>.<role>.ts`
  (`words.table.ts`, `words.schemas.ts`, `words-repo.ts`).
- **`database/schema/` groups by aggregate/domain, not by table** — one folder per
  repository boundary, named to match the repo package (plural). `schema/words/`
  holds the pristine `words` (owned by `WordsRepo`); `schema/async-word-jobs/`
  holds `async_word_jobs` (owned by `AsyncWordJobsRepo`) — **one row per `(word, language, stage)`**,
  `StageState` flattened into columns, not a `payload` jsonb. A domain with a single table is just a
  one-table folder. Only **genuinely cross-domain** helpers (`columns.ts`, `enums.ts` — e.g.
  `timestampColumns`, `languageEnum`, `toEnum`) stay at the `schema/` root; symbols used by a
  **single** domain live in that folder under a role suffix (`<entity>.enums.ts` for its `pgEnum`s,
  `<entity>.content-types.ts` for its jsonb `$type` shapes) — as `async-word-jobs/` does for
  `wordJobStage`/`asyncJobStatus` and its `StageResult`/`JobError` shapes. The barrel
  `schema/index.ts` re-exports every group + the `relations`.
- **Tests:** `*.test.ts` in the workspace's `test/` folder (sibling of `src/`, mirroring its structure) — not colocated with source. See `.claude/rules/testing.md`.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries — the package `exports` entry).

> Filenames stay kebab-case even for `PascalCase` exports (Services/Layers/Schemas) and
> `camelCase` helpers — so a `WordsRepo` service lives in `words-repo.ts`, a `mapRow` helper in
> `map-row.ts`. The symbol names (not the files) carry the `PascalCase` / `camelCase` distinction.

## Effect

- `Context.Service` / `Context.Tag` identifiers use the **slash-namespaced** string id matching the package, e.g. `Context.Tag<WordsRepo>("@lexiai/repositories-words/WordsRepo")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: `<Service>Live` / `<Service>Default` for the concrete layer.
