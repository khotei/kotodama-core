# apps/api — `@lexiai/app-api`

HttpApi server (Effect v4). Runs on Bun locally and on AWS Lambda via the Lambda Web Adapter.

- **May import:** `core/*`, `@lexiai/database` + `repositories/*` (for **layer composition** only),
  `@lexiai/*` packages, `effect`, `@effect/platform-bun`. `@lexiai/database/factories` (pulls faker,
  a devDependency) belongs in tests, not `src/**`.
- **MUST NOT import:** `apps/web` or another app.
- **Owns the HTTP boundary** — `src/words/words.api.ts` (the `HttpApi` contract, composed from
  `WordEntity` (`@lexiai/database`), `Language` (`@lexiai/core-words`), and `WordStateModel` + the
  build errors from `@lexiai/core-async-word-jobs`) and `src/words/words.handler.ts` (the bindings)
  live here as a pair, one folder per resource group.
- Entrypoint: `src/main.ts` → `BunRuntime.runMain`; serves `WordsApi` over Bun on `PORT` (config,
  default 3000). Composes `WordBuildRequester` ← `WordBuildState` ← `WordFinder` ← repos + the live
  `QueueService` ← `DatabaseLive`.
- **Three thin handlers** bind the `words` group: `getWord` → `WordFinder.find` (`Word | null`),
  `getWordState` → `WordBuildState.get` (the `WordStateModel` union `succeeded|running|failed`, or
  `null`), `buildWord` → `WordBuildRequester.request` (the running `WordStateModel` + three typed errors).
- **Handlers send infrastructure faults** (repo/queue unreachable) to a 500: the reads `orDie`, and
  `buildWord` `catchTags`-`die`s `EffectDrizzleQueryError`/`QueueError`. The reads' absence is `null`
  (`Option.getOrNull`); `buildWord` **declares** `WordAlreadyReadyError` (409), `WordBuildInProgressError`
  (409), `InvalidWordInputError` (422) on the endpoint, so those pass through as typed HTTP errors instead of 500s.
- **Gotcha — provide handler deps *after* `HttpRouter.serve`.** HttpApi wraps each handler's service
  requirement (e.g. `WordBuildState`) in a `HttpRouter.Request<"Requires", …>` marker that only
  `serve` unwraps; providing the domain layer to the pre-serve `HttpApiBuilder.layer` does **not**
  satisfy it (the `R` won't reduce to `never`). Provide it to the served layer.
- Effect/HttpApi patterns: `.claude/agent-patterns/effect-httpapi.md`, `.claude/agent-patterns/effect-context-and-layer.md`.
