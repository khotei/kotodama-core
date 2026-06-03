# Naming conventions

## Packages

`@lexiai/<folder>` — nested folders flatten with a dash:

| Folder | Package name |
|---|---|
| `packages/schemas` | `@lexiai/schemas` |
| `packages/http` | `@lexiai/http` |
| `core/words` | `@lexiai/core-words` |
| `repositories/words` | `@lexiai/repositories-words` |
| `database` | `@lexiai/database` |
| `apps/api` | `@lexiai/app-api` |
| `apps/web` | `@lexiai/app-web` |

## Files

- **All source files are `kebab-case`** (lowercase, dash-separated) — regardless of what they
  export. The filename describes the contents; the exported symbol keeps its own casing in code.
  Examples: `config-provider-live.ts` exports `ConfigProviderLive`; `db.ts` exports
  `DB` / `DatabaseLive`; `tracing.ts` exports `TracingLive`; `words.table.ts` exports `wordsTable`.
  Single-word files stay single-word (`db.ts`, `tracing.ts`).
- **Multi-file entities** group in a per-entity folder with a dotted role suffix —
  `<entity>/<entity>.<role>.ts` (`words/words.table.ts`, `words/words.schemas.ts`).
- **Tests:** `*.test.ts`, colocated under `src/`.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries — the package `exports` entry).

> Filenames stay kebab-case even for `PascalCase` exports (Services/Layers/Schemas) and
> `camelCase` helpers — so a `WordsRepo` service lives in `words-repo.ts`, a `mapRow` helper in
> `map-row.ts`. The symbol names (not the files) carry the `PascalCase` / `camelCase` distinction.

## Effect

- `Context.Service` / `Context.Tag` identifiers use the **slash-namespaced** string id matching the package, e.g. `Context.Tag<WordsRepo>("@lexiai/repositories-words/WordsRepo")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: `<Service>Live` / `<Service>Default` for the concrete layer.
