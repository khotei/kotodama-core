# apps/worker — `@kotodama/app-worker`

SQS consumer: one driver-agnostic **consume core** (`src/process-batch.ts`) + two thin edges —
prod is an SQS-triggered Lambda (`src/handler.ts`, event source mapping); local dev/test is a
poll-loop (`src/consume.ts` under `BunRuntime` from `src/main.ts`).

## Load-bearing invariants

- **The core never acks** — deletion is the edges' job (AWS deletes for the prod handler; the
  local loop deletes successes, leaving failures to redrive), so the two edges are identical by
  construction.
- **The prod handler's error channel is `never`** — a build failure becomes a failed *item*
  (`batchItemFailures`), never a thrown exception, or AWS would replay the whole
  successfully-built batch. Defects are isolated per record via `matchCause` (a bare `match` is
  E-only — a `die` in one build would throw past the `never` channel and poison the batch).
- **A foreign message body is skipped** — neither built nor failed/acked — so junk on the queue is
  ignored rather than crashed on; only `requestWordBuild` enqueues the `WordBuildMessage` shape.
- **Idempotency:** ack-only-on-success + `buildWord`'s convergent writes make a redelivered
  message converge on exactly one word. The real SQS visibility timeout must sit **above p99 build
  duration** (≥ 6× the Lambda function timeout) so a still-running build isn't redelivered.
- **`main.ts` is where infra decorators are interposed** — the whole-build timeout
  (`WordGenerationServiceTimed`) and per-call AI retry (`AiServiceResilient` over `AiServiceLive`)
  are wiring choices made only here, never in core. `MockContentEngine` is never wired into
  `main.ts` — tests provide it via their own layers. Swapping engines is a one-line layer change.
- The prod handler stays deploy-clean (no `BunRuntime`/layer wiring); packaging it into the real
  Lambda entry is a later infra feature.

**May import:** `core/*`, `use-cases/*`, `@kotodama/core/database` + `repositories/*` (for
`DatabaseLive`), `@kotodama/*` packages, `effect`, `@effect/platform-bun`. **MUST NOT import:**
another app. `@kotodama/core/database/factories` belongs in tests, not `src/**`.
