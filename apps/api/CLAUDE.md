# apps/api — `@kotodama/app-api`

HttpApi server (Effect v4), Bun locally / AWS Lambda via the Lambda Web Adapter. Root `HttpApi` +
per-resource group/handler pattern: `.claude/agent-patterns/effect-httpapi.md`.

## What this edge owns

- **The computed view models** (`*.view.ts`) collapse rows for presentation — the use-case and repos
  return raw rows, so the collapse is the edge's concern. **`/search` returns the core `Word` union
  verbatim** (same shape as `getWord`/`getWordState`), never an edge-only summary; trim only by
  *picking* `WordEntity` fields into a `Word`-derived leaf, never by renaming (a rename isn't a
  storage transform → no projection, per `core/words`).
- **Offset paging is `pagination.view.ts`** (shared across groups). `pageQuery` self-defaults
  `page`/`limit` at decode (`withDecodingDefaultKey`) → the field is required on the decoded type, so
  the **typed Effect client MUST pass `page`/`limit`** (the default only fills an omitting *wire*
  caller). `WORD_SEARCH_{DEFAULT,MAX}_LIMIT` are this edge's policy. `counts` and `search` share
  `wordSearchFilter`, so counts always equal what the list can page.

## Wire semantics (not guessable)

- Absence → 200 `null`; an existing-but-building word → `WordNotReadyError` **409, not 404** (404
  would read as non-existence while the word exists).
- Handlers `die` infra faults (`EffectDrizzleQueryError`, `QueueError`, `SqlError`, a decode error on
  a succeeded row) into 500s; only the declared typed errors (409/422) pass through.

## Gotchas

- **Provide handler deps *after* `HttpRouter.serve`** — HttpApi wraps each handler's requirement in a
  `HttpRouter.Request<"Requires">` marker only `serve` unwraps; providing to the pre-serve
  `HttpApiBuilder.layer` does NOT satisfy it.
- `main.ts` provides only boundary services (`DatabaseLive`, `JobsQueueLive`, `AiServiceProd`). Its
  `AiServiceProd` deliberately omits the worker's resilience decorator — the input judge is fail-open,
  so retry buys little and would pull image tuning into a text-only app.

No cross-app import; `@kotodama/database/factories` belongs in tests, never `src/**`.
