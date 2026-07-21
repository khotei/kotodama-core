# apps/api — `@kotodama/app-api`

HttpApi server (Effect v4); Bun locally, AWS Lambda via the Lambda Web Adapter. `src/kotodama.api.ts`
is the single root `HttpApi` that composes every resource's `HttpApiGroup`; each resource is a folder
pairing its group contract (`src/words/words.api.ts`) with its handlers (`words.handler.ts`). Adding a
resource is one `.add(...)` on the root — the OpenAPI doc (served from `main.ts` via `openapiPath`) is
derived from the root, so it reflects new groups automatically. Patterns:
`.claude/agent-patterns/effect-httpapi.md`.

## What this edge owns (and why it's here, not core)

- **The computed view models** (`word-state.view.ts`, `word-counts.view.ts`) — presentation shapes
  with no backing row; their leaf payloads derive from `WordEntity`/the content schemas so they
  can't drift. The collapse is this edge's concern — the use-case and repos return raw rows.
  **`/search` has no view of its own** — it returns the core `Word` union verbatim (same shape
  `getWord`/`getWordState` speak), never an edge-only summary. A renamed/flattened list projection
  was deleted: a field rename is not a storage transform, so by `core/words`' "no per-row model"
  rule it doesn't earn a projection; trim (if ever needed) by *picking* `WordEntity` fields into a
  `Word`-derived leaf, never by renaming.
- **Offset paging is `pagination.view.ts`** — the shared reuse across resource groups: `pageQuery`
  builds the `page`/`limit` query fields, `Paginated(items)` the response envelope (only the item
  schema varies). `pageQuery` self-defaults `page`/`limit` at decode via `withDecodingDefaultKey`,
  so the handler reads both as required (no `?? default`). Consequence: the field is required on the
  decoded `Type`, so the **typed Effect client must pass `page`/`limit`** (the default only fills an
  omitting *wire* caller); the constants (`WORD_SEARCH_DEFAULT_LIMIT`, `WORD_SEARCH_MAX_LIMIT`) are
  this edge's policy, passed into `pageQuery`. `counts` and `search` read the same `wordSearchFilter`,
  so counts always equal what the list can page.

## Wire semantics that aren't guessable

- Absence is 200 `null`; an existing-but-building word is the declared `WordNotReadyError` **409,
  not 404** (404 would read as non-existence while the word exists and is building).
- Handlers `die` infrastructure faults (`EffectDrizzleQueryError`, `QueueError`, `SqlError`,
  decode `SchemaError` on a succeeded row = impossible state) into 500s; only the declared typed
  errors (409/422) pass through.

## Gotchas

- **Provide handler deps *after* `HttpRouter.serve`** — HttpApi wraps each handler's service
  requirement in a `HttpRouter.Request<"Requires", …>` marker that only `serve` unwraps; providing
  the domain layer to the pre-serve `HttpApiBuilder.layer` does NOT satisfy it.
- `main.ts` provides only boundary services (`DatabaseLive`, `JobsQueueLive`, `AiServiceProd`) —
  handler flows are plain functions whose `R` bottoms out there. The API's `AiServiceProd`
  deliberately duplicates the worker's (~10 lines) and omits its resilience decorator: the input
  judge is fail-open, so retry buys little and would pull image-path tuning into a text-only app.

**May import:** `core/*`, `use-cases/*`, `@kotodama/core/database` + `repositories/*`, `@kotodama/*`
packages, `effect`, `@effect/platform-bun`. **MUST NOT import:** another app.
`@kotodama/core/database/factories` belongs in tests, not `src/**`.
