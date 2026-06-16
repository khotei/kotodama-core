# apps/worker — `@lexiai/app-worker`

SQS consumer (Effect v4). One shared **consume core** + **two thin edge drivers** — the same
`WordBuilder` work reached two ways: prod is an **SQS-triggered Lambda** (event source mapping, *Model
A*); local dev/test is a **poll-loop**. `WordBuildRequester` (`apps/api`) enqueues; this worker consumes
and runs `WordBuilder`. The full end-to-end path is `POST .../build` → queue → worker → core → db → Ready.

- **Core — `src/process-batch.ts`:** `processBatch(records) → failedIds`, driver-agnostic (plain
  `{id,body}`, no SQS/`QueueService` shape leaks in). Decodes each body; a foreign body is **skipped**
  (neither built nor failed); a build failure is caught and isolated. `R` is `WordBuilder`-only (no
  `QueueService`) — the core **never acks**, so the two edges are identical by construction.
- **Prod edge — `src/handler.ts` (`sqsBatchHandler`):** `(SQSEvent) → SQSBatchResponse`. AWS owns
  polling + deletion; the handler returns only the **failures** as `batchItemFailures` (`itemIdentifier
  = messageId`). **Load-bearing invariant:** its error channel is `never` — a build error becomes a
  failed *item*, never a thrown exception, or AWS would replay the whole successfully-built batch. It is
  **deploy-clean** (no `BunRuntime`/layer wiring); packaging it into the real `(SQSEvent) => Promise`
  Lambda entry (runtime built once + prod layer + `runPromise`) is a later infra feature.
- **Local edge — `src/consume.ts` (`consumeForever`):** a poll-loop for dev/test only — `receive` →
  `processBatch` → **delete the successes**, leave failures to redrive — reproducing the ESM contract by
  hand so it matches prod. Runs under `BunRuntime` from `src/main.ts`.

- **May import:** `core/*`, `@lexiai/database` + `repositories/*` (for **layer composition** only),
  `@lexiai/*` packages, `effect`, `@effect/platform-bun`. `@lexiai/database/factories` (pulls faker,
  a devDependency) belongs in tests, not `src/**`.
- **MUST NOT import:** `apps/web` or another app.
- **Layer composition (`src/main.ts`, the local entrypoint):** `WorkerLive` = `WordBuilder` ←
  `MockContentEngine` + repos, alongside the live SQS `QueueService`, all ← `DatabaseLive`. The prod
  Lambda entry will provide the same layer once, around `sqsBatchHandler`.
- **The swap boundary is the `ContentEngine` layer** — `MockContentEngine` now, the real OpenAI engine
  next milestone, a one-line layer change (nothing else moves).
- **Idempotency rests on two contracts:** an edge acks (deletes) a record **only on success** — AWS does
  this for the prod handler, the local loop deletes the successes — so a crash/failure redrives the
  message; and `WordBuilder`'s promotion upsert + idempotent stage writes make a re-delivered message
  converge on exactly one word. The real SQS visibility timeout must sit **above p99 build duration**
  (≥ 6× the Lambda function timeout) so a still-running build isn't redelivered.
- **Only `WordBuildMessage` bodies are built** — a body that doesn't decode as the shared
  `WordBuildMessageFromJson` shape is skipped (not built, not acked), so a foreign message on the queue
  is ignored rather than crashing the worker. Only `WordBuildRequester` enqueues this shape.
- **Scope:** happy-path loop + idempotency. Build failure / retry / backoff / timeout is T08.
