# apps/worker — `@kotodama/app-worker`

SQS consumer: one driver-agnostic **consume core** (`process-batch.ts`) + two thin edges — prod
Lambda (`handler.ts`) and local poll-loop (`consume.ts`).

## Load-bearing invariants

- **The core never acks** — deletion is the edges' job (AWS for prod; the local loop deletes
  successes, leaves failures to redrive), so the two edges stay identical by construction.
- **The prod handler's error channel is `never`** — a build failure is a failed *item*
  (`batchItemFailures`), never a throw, else AWS replays the whole built batch. Defects are isolated
  per record via `matchCause` (a bare `match` is E-only — a `die` would throw past `never` and poison
  the batch).
- **A foreign message body is skipped** (neither built nor acked) — only `requestWordBuild` enqueues
  the `WordBuildMessage` shape.
- **Idempotency:** ack-only-on-success + `buildWord`'s convergent writes → a redelivered message
  converges on one word. The SQS visibility timeout MUST sit above p99 build duration (≥ 6× the
  Lambda function timeout) so a still-running build isn't redelivered.
- **`main.ts` interposes the infra decorators** — the whole-build timeout
  (`WordGenerationServiceTimed`) and per-call AI retry (`AiServiceResilient`) are wired only here,
  never in core; `MockContentEngine` is wired only by tests. Engine swap = one layer line.

No cross-app import; `@kotodama/database/factories` belongs in tests, never `src/**`.
