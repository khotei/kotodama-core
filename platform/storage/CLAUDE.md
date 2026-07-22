# platform/storage — `@kotodama/platform/storage`

An object-storage port over `Bun.S3Client` (a Bun global, no npm dep): one service, **`ImagesStore`**,
whose `ImagesStoreLive` owns the client and binds `ImagesBucket` (from `@kotodama/platform/config`)
at layer build, exposing `put(key, …)` — no per-call bucket. Mirrors `@kotodama/platform/queue`'s
single bound `JobsQueue`. **Backend-only.**

- **One bucket, one service.** The earlier `StorageClient`/`ImagesStore` base+wrapper split bought a
  speculative multi-bucket capability the app never used (there is exactly one images bucket); a
  second bucket would be a second `*Live` layer reading its own config, not a per-call `bucket` arg.

- **The deterministic key scheme lives only here** — `imageKey`/`authorKey` in `storage-types.ts`;
  callers pass derived inputs, never raw paths. Keys and returns are plain strings (a leaf package
  imports nothing internal except `@kotodama/platform/config`); `put` returns the same key so a stage threads
  one value. This package never produces a URL — presigning is the read side's concern, elsewhere.
- **Config-resolved credentials + bucket, not `Bun.S3Client`'s ambient env read** — the client
  **snapshots ambient creds at process start and ignores runtime `process.env` injection**, so the
  LocalStack harness can only point it at the container through the `ConfigProvider` seam
  (`AwsClientConfig`, shared with the SQS client).

## Testing — `@kotodama/platform/storage/testing`

Real `Bun.S3Client` over a per-file LocalStack S3 container (`StorageLocalStackLive`,
`SERVICES=s3`) — no in-memory fake; copies the `@kotodama/platform/queue/testing` template (see
`.claude/rules/testing.md`). Inspect with `bucketObjects` (S3 LIST is unordered ⇒ assert key
**sets**); isolate with `resetBucket` at the **start** of each writing test. Downstream suites
that do no S3 I/O provide the exported `UnusedStorage` (an `ImagesStore` that dies on `put`)
instead of booting a container.

**May import:** `effect`, `@kotodama/platform/config` (+ the `Bun` global).
