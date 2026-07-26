# platform/storage — `@kotodama/platform/storage`

Object-storage port over `Bun.S3Client` (a Bun global — **no npm dep**): one service **`ImagesStore`**
whose `ImagesStoreLive` binds `ImagesBucket` at layer build (`put(key, …)`, no per-call bucket).
Mirrors `queue`'s single bound `JobsQueue`. **Backend-only.**

- **One bucket, one service** — a second bucket is a second `*Live` reading its own config, not a
  per-call `bucket` arg.
- **The deterministic key scheme lives only here** — `imageKey`/`authorKey` (`storage-types.ts`);
  callers pass derived inputs, never raw paths. This package **never produces a URL** — presigning is
  the read side's concern, elsewhere.
- **Config-resolved creds + bucket, not `Bun.S3Client`'s ambient env read** — the client snapshots
  ambient creds at process start and ignores runtime `process.env` injection, so the LocalStack
  harness can only reach it through the `ConfigProvider` seam (`AwsClientConfig`, shared with SQS).

## Testing — `@kotodama/platform/storage/testing`

Real `Bun.S3Client` over a per-file LocalStack S3 container (`StorageLocalStackLive`), copying the
queue/testing template. Inspect with `bucketObjects` (S3 LIST is unordered ⇒ assert key **sets**);
`resetBucket` at the start of each writing test. Suites with no S3 I/O provide `UnusedStorage` (dies
on `put`) instead of booting a container.
