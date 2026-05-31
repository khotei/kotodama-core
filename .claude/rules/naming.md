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

- **Services / Layers / Schemas:** `PascalCase` file = the thing it exports (`WordsRepo.ts`, `AppConfig.ts`, `Word.ts`).
- **Utilities / helpers:** `camelCase` (`mapRow.ts`).
- **Tests:** `*.test.ts`, colocated under `src/`.
- **Entrypoints:** `src/main.ts` (apps), `src/index.ts` (libraries — the package `exports` entry).

## Effect

- `Context.Service` / `Context.Tag` identifiers use the **slash-namespaced** string id matching the package, e.g. `Context.Tag<WordsRepo>("@lexiai/repositories-words/WordsRepo")`.
- Tagged errors: `PascalCase` ending in `Error` (`WordNotFoundError`), via `Data.TaggedError`.
- Layers: `<Service>Live` / `<Service>Default` for the concrete layer.
