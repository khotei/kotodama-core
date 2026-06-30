# apps/api — `@lexiai/app-api`

HttpApi server (Effect v4). Runs on Bun locally and on AWS Lambda via the Lambda Web Adapter.

- **May import:** `core/*`, `use-cases/*`, `@lexiai/database` + `repositories/*` (the former both for the
  `DatabaseLive` layer and for the row/entity vocabulary), `@lexiai/*` packages, `effect`,
  `@effect/platform-bun`. `@lexiai/database/factories` (pulls faker, a devDependency) belongs in tests,
  not `src/**`.
- **MUST NOT import:** `apps/web` or another app.
- **Owns the HTTP boundary** — `src/words/words.api.ts` (the `HttpApi` contract, composed from
  `WordEntity` (`@lexiai/database`), `Language` + `InvalidWordInputError` + the two build-policy 409s
  (`@lexiai/core-words`), and the local `WordStateView`) and
  `src/words/words.handler.ts` (the bindings) live here as a pair, one folder per resource group.
- **Owns the build-state view** — `src/words/word-state.view.ts` (`WordStateView`, the
  `succeeded|running|failed` view model) + `src/words/word-state-collapse.ts` (`collapseWordState`, its
  pure single author). The view collapse is presentation, so it lives at this edge, not in `core/`; the
  use-case returns raw rows and the handler collapses them. The pure `collapseWordState` is unit-tested
  here (`test/word-state-collapse.test.ts`); `assertStatus` (the variant-narrowing test helper) lives in
  `test/words-api-test-utils.ts`.
- Entrypoint: `src/main.ts` → `BunRuntime.runMain`; serves `WordsApi` over Bun on `PORT` (config,
  default 3000). The handler flows are plain functions (repos are bare functions, `requestWordBuild`
  is a function), so `main.ts` provides only the two **boundary** services they bottom out at —
  `JobsQueueLive` (over `QueueClientLive`) + `DatabaseLive` (`DomainLive = Layer.mergeAll(JobsQueueLive.pipe(Layer.provide(QueueClientLive)), DatabaseLive)`).
- **Three handlers** bind the `words` group: `getWord` → `selectWord` (`Word | null`); `getWordState`
  reads a `{ word, stages }` snapshot via `readWordBuildSnapshot` (`@lexiai/core-async-word-jobs`) then collapses it with the
  local `collapseWordState` (the `WordStateView` union `succeeded|running|failed`, or `null`); and
  `buildWord` → `requestWordBuild` (which returns the seeded rows) collapsed here into the running
  `WordStateView` (+ three typed errors). The handler `R` bottoms out at `DB` / `JobsQueue`.
- **Handlers send infrastructure faults** (repo/queue unreachable) to a 500: the reads `orDie`, and
  `buildWord` `catchTags`-`die`s `EffectDrizzleQueryError`/`QueueError`. The reads' absence is `null`
  (`Option.getOrNull`); `buildWord` **declares** `WordAlreadyReadyError` (409), `WordBuildInProgressError`
  (409), `InvalidWordInputError` (422) on the endpoint, so those pass through as typed HTTP errors instead of 500s.
- **Gotcha — provide handler deps *after* `HttpRouter.serve`.** HttpApi wraps each handler's service
  requirement (e.g. `DB`) in a `HttpRouter.Request<"Requires", …>` marker that only
  `serve` unwraps; providing the domain layer to the pre-serve `HttpApiBuilder.layer` does **not**
  satisfy it (the `R` won't reduce to `never`). Provide it to the served layer.
- Effect/HttpApi patterns: `.claude/agent-patterns/effect-httpapi.md`, `.claude/agent-patterns/effect-context-and-layer.md`.
