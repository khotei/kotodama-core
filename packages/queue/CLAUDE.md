# packages/queue — `@lexiai/queue`

`QueueService` — a message-agnostic queue port (`send` / `receive` / `delete`-ack) implemented by
`QueueServiceLive` (SQS via `@aws-sdk/client-sqs`, configured through `@lexiai/config`, honoring an
optional `AWS_ENDPOINT_URL` for LocalStack). **Backend-only.** There is **no in-memory fake** — tests
run this same layer over a per-file LocalStack container (see Testing below).

- **May import:** `effect`, `@aws-sdk/client-sqs`, `@lexiai/config`.
- **MUST NOT** be imported by `apps/web`.
- **Message-agnostic on purpose** — bodies are opaque strings; the build-message schema
  (`{ language, word }`) lives with the enqueuer (`WordBuildRequester`), not here, so the transport stays
  reusable.

## Testing — `@lexiai/queue/testing`

**No in-memory fake.** Every queue-touching test runs the real `QueueServiceLive` over a **per-file
LocalStack SQS container** (`QueueLocalStackLive`) — the queue analogue of `@lexiai/database/testing`'s
`TestDatabaseLive` (link, don't restate); `it.layer(QueueLocalStackLive, { timeout: '120 seconds' })`.

> **Decision (the `QueueServiceInMemory` fake was removed, user-driven):** a hand-modelled fake is itself
> a divergent double, and the project is heading to e2e where the real adapter is needed anyway — so the
> SDK ⇄ SQS path is exercised directly for fidelity at the seam. **Cost accepted:** a second container per
> queue file + SQS's non-deterministic receive (cap-10, may-return-fewer, visibility timing), contained
> by the helpers below.

- **`drainQueue`** — receive-and-delete every visible message in a loop (SQS caps a receive at 10 and may
  return fewer than available). Deleting as it drains stops a message reappearing after its visibility
  timeout to pollute a later test, so it is both the per-test purge (the SQS analogue of `resetDb`, call
  at the top of each test) and the "what got enqueued?" assertion source. **`receive({ max: 1000 })` is a
  removed fake idiom — never reintroduce it.**
- **Worker poll is a `Context.Reference`** — `consumeOnce` reads `ConsumePoll` (default 20s long-poll);
  tests `Layer.succeed` a 1s wait so an empty-queue poll returns promptly instead of blocking 20s.

- **Dev-untouched invariant (the load-bearing one):** the harness overrides the `@lexiai/config` AWS
  seam (`JOBS_QUEUE_URL`/`AWS_REGION`/`AWS_ENDPOINT_URL`) with a **replacement** `ConfigProvider`
  built from the container's `getConnectionUri()` — `ConfigProviderLive` (the dev `:4566` `.env`) is
  never in the test layer graph, so a test cannot reach the dev LocalStack. `QueueServiceLive` is
  reused **verbatim** (design A; design B = a `make(values)`/config split à la `PgClient.layer` vs
  `.layerConfig`, deferred — see the F-PLAT-008 feature page).
- **Dummy AWS creds:** the harness sets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (`??=`) — the SDK
  must sign every request even though LocalStack ignores the signature; the prod layer carries no
  creds (the Lambda role's default chain supplies them).
- **Image `localstack/localstack:4.4.0`** (last free, no-token; matches the dev compose pin); `SERVICES=sqs`
  keeps the boot lean. No `withWaitStrategy` override — the module default is log-based (no macOS hang).
