# platform/queue — `@kotodama/platform/queue`

A message-agnostic queue port over `@aws-sdk/client-sqs`: one service, **`JobsQueue`**, whose
`JobsQueueLive` owns the `SQSClient` and binds `JobsQueueUrl` (from `@kotodama/platform/config`) at
layer build, exposing resource-free `send`/`receive`/`delete`. **Backend-only.**

- **One queue, one service — no parameterized base.** The earlier `QueueClient`/`JobsQueue`
  base+wrapper split bought a speculative multi-queue capability the app never used (there is exactly
  one jobs queue); a second queue (e.g. a DLQ) is a second `*Live` layer reading its own config URL,
  not a per-call `queueUrl` argument.

- **Message-agnostic on purpose** — bodies are opaque strings; the build-message schema lives in
  `core/words` (with the word domain, near the enqueuer), so the transport stays reusable.
- `ensureQueue(client, name)` is provisioning, not the port (the caller owns the `SQSClient`);
  idempotent with no pre-check — `CreateQueue` with no attributes is a no-op on an existing queue.

## Testing — `@kotodama/platform/queue/testing`

**No in-memory fake** — a hand-modelled fake is itself a divergent double, so every queue-touching
test runs the real `JobsQueueLive` on a per-file LocalStack container
(`QueueLocalStackLive`; `it.layer(…, { timeout: '120 seconds' })`). Cost accepted: SQS's
non-deterministic receive (cap-10, may-return-fewer, visibility timing), contained by the helpers:

- **`drainQueue`** — receive-and-delete every visible message in a loop; both the per-test purge
  (call at the top of each test, like `resetDb`) and the "what got enqueued?" assertion source.
  `receive({ max: 1000 })` is a removed fake idiom — never reintroduce it.
- **`ConsumePoll` is a `Context.Reference`** (default 20s long-poll) — tests `Layer.succeed` a 1s
  wait so an empty-queue poll returns promptly.
- **`withSqs(use)`** — a short-lived SDK client at the container endpoint, for driving raw SQS
  primitives (`ensureQueue`).
- **Dev-untouched invariant:** the harness overrides the `@kotodama/platform/config` AWS seam with a
  **replacement** `ConfigProvider` built from the container's URI — `ConfigProviderLive` (the dev
  `.env`) is never in the test layer graph, so a test structurally cannot reach the dev LocalStack.
  Dummy AWS creds ride the same provider (the SDK must sign even though LocalStack ignores it); in
  prod the Lambda role injects them via env into the same `AwsClientConfig`.
- Image pinned `localstack/localstack:4.4.0`, `SERVICES=sqs`.

**May import:** `effect`, `@aws-sdk/client-sqs`, `@kotodama/platform/config`.
