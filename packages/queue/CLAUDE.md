# packages/queue — `@lexiai/queue`

A message-agnostic queue port (`send` / `receive` / `delete`-ack), split into a **parameterized base +
a bound wrapper** (F-PLAT-012) so the boundary is multi-queue-capable by construction while business
code keeps a resource-free call. SQS via `@aws-sdk/client-sqs`, configured through `@lexiai/config`,
honoring an optional `AWS_ENDPOINT_URL` for LocalStack. **Backend-only.** There is **no in-memory
fake** — tests run these same layers over a per-file LocalStack container (see Testing below).

- **`QueueClient`** (base, `QueueClientLive`) — holds **only** the `SQSClient` (built from
  `AwsClientConfig` via `acquireRelease`, `destroy()`ed on release; **no** bound queue). Ops take the
  queue URL **per call**: `send(queueUrl, body)` / `receive(queueUrl, opts?)` / `delete(queueUrl, handle)`.
  One client serves any number of queues — the SDK already does, only the old single-bind layer didn't.
- **`JobsQueue`** (bound wrapper, `JobsQueueLive`) — the resource-free port business code yields. A
  `Layer` over `QueueClient` that binds `awsResources.jobsQueue` → `JOBS_QUEUE_URL` (the existing
  `JobsQueueUrl` config) and exposes `send(body)` / `receive(opts?)` / `delete(handle)`, each delegating
  to the base with that URL. **Not a deep-modules §5 pass-through** — the base speaks `(queueUrl, …)`,
  the wrapper speaks `(…)`: it removes a parameter by owning the *which-queue* binding. Provide it over
  `QueueClientLive` (`JobsQueueLive.pipe(Layer.provide(QueueClientLive))`).
- **Adding a second queue later** (e.g. a DLQ) is one `awsResources` entry + its config + **one more
  bound wrapper** over the same base — **no** `QueueClient` change.
- **Shared vocabulary** lives in `queue-types.ts` — `QueueMessage` / `ReceiveOptions` / `QueueError`,
  reused by the base, the wrapper, `ensureQueue`, and callers.
- **May import:** `effect`, `@aws-sdk/client-sqs`, `@lexiai/config`.
- **MUST NOT** be imported by `apps/web`.
- **`ensureQueue(client, name)`** — a create-if-absent SQS primitive (returns the queue URL), separate
  from the port because provisioning is wiring, not the message port: the caller owns the `SQSClient`.
  Idempotent with no pre-check — `CreateQueue` with no attributes is a no-op on an existing same-name
  queue. Consumed by the test harness and `local:provision`.
- **Message-agnostic on purpose** — bodies are opaque strings; the build-message schema
  (`{ language, word }`) lives with the enqueuer (`requestWordBuild`), not here, so the transport stays
  reusable.

## Testing — `@lexiai/queue/testing`

**No in-memory fake.** Every queue-touching test runs the real `JobsQueueLive` over `QueueClientLive` on
a **per-file LocalStack SQS container** (`QueueLocalStackLive`) — the queue analogue of
`@lexiai/database/testing`'s `TestDatabaseLive` (link, don't restate);
`it.layer(QueueLocalStackLive, { timeout: '120 seconds' })`. The base's own multi-queue contract (driving
`send`/`receive`/`delete` with an explicit URL) is pinned separately via `QueueClientLocalStackLive`.

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
- **`withSqs(use)`** — runs `use` with a short-lived SDK `SQSClient` at the container endpoint
  (destroyed on settle), the queue analogue of `@lexiai/storage/testing`'s `withS3`. The seam for
  driving raw SQS primitives (`ensureQueue`) at the `QueueLocalStackLive` layer — which now
  `provideMerge`s the container into context so the client is reachable.

- **Dev-untouched invariant (the load-bearing one):** the harness overrides the `@lexiai/config` AWS
  seam (`JOBS_QUEUE_URL`/`AWS_REGION`/`AWS_ENDPOINT_URL`) with a **replacement** `ConfigProvider`
  built from the container's `getConnectionUri()` — `ConfigProviderLive` (the dev `:4566` `.env`) is
  never in the test layer graph, so a test cannot reach the dev LocalStack. `QueueClientLive` +
  `JobsQueueLive` are reused **verbatim** (design A; design B = a `make(values)`/config split à la
  `PgClient.layer` vs `.layerConfig`, deferred — see the F-PLAT-008 feature page).
- **Dummy AWS creds:** the harness puts `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in the replacement
  `ConfigProvider` (not a runtime `process.env` write) — `QueueClientLive` reads them via
  `@lexiai/config`'s `AwsClientConfig` and passes them to the SDK, which must sign every request even
  though LocalStack ignores the signature. In prod the Lambda role injects all three (incl. session
  token) into the env, which the same `AwsClientConfig` resolves.
- **Image `localstack/localstack:4.4.0`** (last free, no-token; matches the dev compose pin); `SERVICES=sqs`
  keeps the boot lean. No `withWaitStrategy` override — the module default is log-based (no macOS hang).
