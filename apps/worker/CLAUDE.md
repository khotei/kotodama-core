# apps/worker — `@lexiai/app-worker`

SQS consumer (Effect v4). One shared **consume core** + **two thin edge drivers** — the same
`buildWord` work reached two ways: prod is an **SQS-triggered Lambda** (event source mapping, *Model
A*); local dev/test is a **poll-loop**. `requestWordBuild` (`apps/api`) enqueues; this worker consumes
and runs `buildWord` (`@lexiai/use-cases`, a plain function). The full end-to-end path is
`POST .../build` → queue → worker → core → db → Ready.

- **Core — `src/process-batch.ts`:** `processBatch(records) → failedIds`, driver-agnostic (plain
  `{id,body}`, no SQS/`JobsQueue` shape leaks in). Decodes each body; a foreign body is **skipped**
  (neither built nor failed); a build failure **or defect** is caught and isolated (`matchCause`, so a
  `die` in one build can't poison the batch — a bare `match` is E-only and a defect would throw past the
  prod edge's `never` channel). `R` is `WordGenerationService | DB`
  (`buildWord`'s deps; no `JobsQueue`) — the core **never acks**, so the two edges are identical by
  construction.
- **Prod edge — `src/handler.ts` (`sqsBatchHandler`):** `(SQSEvent) → SQSBatchResponse`. AWS owns
  polling + deletion; the handler returns only the **failures** as `batchItemFailures` (`itemIdentifier
  = messageId`). **Load-bearing invariant:** its error channel is `never` — a build error becomes a
  failed *item*, never a thrown exception, or AWS would replay the whole successfully-built batch. It is
  **deploy-clean** (no `BunRuntime`/layer wiring); packaging it into the real `(SQSEvent) => Promise`
  Lambda entry (runtime built once + prod layer + `runPromise`) is a later infra feature.
- **Local edge — `src/consume.ts` (`consumeForever`):** a poll-loop for dev/test only — `receive` →
  `processBatch` → **delete the successes**, leave failures to redrive — reproducing the ESM contract by
  hand so it matches prod. Runs under `BunRuntime` from `src/main.ts`.

- **May import:** `core/*`, `use-cases/*`, `@lexiai/database` + `repositories/*` (for the `DatabaseLive`
  layer; the repo functions ride in via `buildWord`'s `R`, not imported directly here),
  `@lexiai/*` packages, `effect`, `@effect/platform-bun`. `@lexiai/database/factories` (pulls faker,
  a devDependency) belongs in tests, not `src/**`.
- **MUST NOT import:** `apps/web` or another app.
- **Layer composition (`src/main.ts`, the local entrypoint):** `buildWord` is a plain function, so
  `WorkerLive` is just the boundary services its `R` bottoms out at —
  `Layer.mergeAll(JobsQueueLive.pipe(Layer.provide(QueueClientLive)), GenerationLive, DatabaseLive)` (the
  queue the loop polls + the timed generation service + the live `DB`). No use-case or per-repo layer.
  The prod Lambda entry will provide the same layer once, around `sqsBatchHandler`.
- **`buildWord`'s generation seam is `WordGenerationService`, and `main.ts` is where the infra layers are
  interposed.** `GenerationLive` = `WordGenerationServiceTimed(DEFAULT_BUILD_TIMEOUT)` over
  `WordGenerationServiceLive` over `ContentEngineLive` — so the whole-build **timeout** is a decorator
  layer chosen here, and `ContentEngine` is now an **internal** dependency of `GenerationLive`, no longer
  a top-level worker service. `ContentEngineLive` = `RealContentEngineLive` over its three leaves
  (`AiServiceProd`, `WikiClientLive` ← `BunHttpClient.layer`, `ImagesStoreLive` over `StorageClientLive`);
  the Ai+Storage `ConfigError` closes against the entrypoint's `ConfigProviderLive`. **`AiServiceProd`
  is the `AiServiceResilient(TEXT_RESILIENCE, IMAGE_RESILIENCE)` decorator over `AiServiceLive`** — so
  per-call **retry** is also chosen here (the engine makes bare `ai.*` calls), and `AiServiceLive` still
  carries the two OpenAI clients (`OpenAiClient` + `OpenAiClientGenerated`, keyed off `OPENAI_API_KEY`)
  on its `R`, provided over `BunHttpClient` — so `@lexiai/ai` owns no config/HTTP and `*Default` is
  retired. Both infra layers (retry + timeout) live **only** at this wiring, never in core. `MockContentEngine`
  is no longer wired into `main.ts` — it stays the test/demo layer, provided directly by the worker tests'
  own layers (wrapped in `WordGenerationServiceLive`), never via `main.ts`. Swapping engines is still a
  one-line layer change here.
- **Idempotency rests on two contracts:** an edge acks (deletes) a record **only on success** — AWS does
  this for the prod handler, the local loop deletes the successes — so a crash/failure redrives the
  message; and `buildWord`'s promotion upsert (`assembleWord` → `upsertWords`) + idempotent stage
  writes make a re-delivered message converge on exactly one word. The real SQS visibility timeout must sit **above p99 build duration**
  (≥ 6× the Lambda function timeout) so a still-running build isn't redelivered.
- **Only `WordBuildMessage` bodies are built** — a body that doesn't decode as the shared
  `WordBuildMessageFromJson` shape is skipped (not built, not acked), so a foreign message on the queue
  is ignored rather than crashing the worker. Only `requestWordBuild` enqueues this shape.
- **Scope:** happy-path loop + idempotency. Build failure / retry / backoff / timeout is T08.
