# platform/queue — `@kotodama/platform/queue`

Message-agnostic queue port over `@aws-sdk/client-sqs`: one service **`JobsQueue`** whose
`JobsQueueLive` binds `JobsQueueUrl` at layer build (resource-free `send`/`receive`/`delete`).
**Backend-only.**

- **One queue, one service — no parameterized base.** A second queue (e.g. a DLQ) is a second
  `*Live` reading its own config URL, **not** a per-call `queueUrl` argument.
- **Message-agnostic on purpose** — bodies are opaque strings; the build-message schema lives in
  `core/words` (near the enqueuer), so the transport stays reusable.
- `ensureQueue(client, name)` is provisioning, not the port (the caller owns the `SQSClient`);
  idempotent, no pre-check — `CreateQueue` with no attributes is a no-op on an existing queue.

## Testing — `@kotodama/platform/queue/testing`

Real `JobsQueueLive` on a per-file LocalStack container (`QueueLocalStackLive`), never an in-memory
fake. SQS's non-deterministic receive is contained by:

- **`drainQueue`** — receive-and-delete every visible message in a loop; both the per-test purge and
  the "what got enqueued?" assertion source. `receive({ max: 1000 })` is a removed fake idiom — never
  reintroduce it.
- **`withSqs(use)`** — a short-lived SDK client at the container endpoint for raw SQS primitives.
- **Dev-untouched invariant:** the harness overrides the config AWS seam with a **replacement**
  `ConfigProvider` built from the container URI — `ConfigProviderLive` never enters the test graph, so
  a test structurally cannot reach the dev LocalStack. Dummy creds ride the same provider.
