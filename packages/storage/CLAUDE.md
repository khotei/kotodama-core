# packages/storage — `@lexiai/storage`

An object-storage port over `Bun.S3Client` (a Bun global, no npm dep), split into a **parameterized
base + a bound wrapper** (F-PLAT-012) so the boundary is multi-bucket-capable by construction while
business code keeps a resource-free call. **Backend-only.** No in-memory fake — tests run these same
layers over a per-file LocalStack container (see Testing below).

- **`StorageClient`** (base, `StorageClientLive`) — holds one `Bun.S3Client` built from
  `@lexiai/config`'s shared `AwsClientConfig` (region + optional endpoint + optional credentials,
  pre-resolved) with **no bound bucket**. `put(bucket, key, bytes, opts?)` takes the bucket **per call**
  and routes the write via `Bun.S3Client`'s per-call `S3Options.bucket` override
  (`client.write(key, bytes, { type, bucket })`) — one client serves any number of buckets without a
  per-bucket client pool. Maps a client rejection to one `StorageError`; carries a `ConfigError`.
- **`ImagesStore`** (bound wrapper, `ImagesStoreLive`) — the resource-free port business code yields. A
  `Layer` over `StorageClient` that binds `awsResources.imagesBucket` → `IMAGES_BUCKET` (the existing
  `ImagesBucket` config) and exposes `put(key, bytes, opts?)`, delegating to the base with that bucket.
  **Not a deep-modules §5 pass-through** — the base speaks `(bucket, …)`, the wrapper speaks `(…)`: it
  removes a parameter by owning the *which-bucket* binding. Provide it over `StorageClientLive`
  (`ImagesStoreLive.pipe(Layer.provide(StorageClientLive))`).
- **Adding a second bucket later** (e.g. an audio or separate-visuals bucket) is one `awsResources`
  entry + its config + **one more bound wrapper** over the same base — **no** `StorageClient` change.
- **May import:** `effect`, `@lexiai/config`. Uses the `Bun` runtime global for S3.
- **MUST NOT** be imported by `apps/web` (covered by the `apps/web` catch-all `@lexiai/*` ban in
  `biome.json` — no per-package entry needed).

## Load-bearing wiring

- **Shared vocabulary lives in `storage-types.ts`** — `StorageError`, `StoragePutOptions` (the `put`
  write-options, the single extension point for future S3 knobs), `imageKey`, `authorKey`,
  `ImageKeyInput`, `AuthorKeyInput`, reused by the base, the wrapper, and callers.
- **Deterministic key scheme lives only here** — `imageKey` (`visuals/{language}/{word}/{kind}.png`,
  `…/{kind}-{index}.png` with an index) and `authorKey` (`authors/{language}/{word}/{index}.png`).
  Callers pass derived inputs, never raw paths; the engine maps the returned **plain string** into
  the schema's `StorageKey`. `put` keys and returns are plain strings — the package imports no
  `@lexiai/database` (leaf packages take nothing internal except `@lexiai/config`).
- **`put` returns the same `key`** so a stage threads one value (write → store key). The read side
  presigns the key to a URL elsewhere — this package never produces a URL.
- **Config-resolved credentials, not `Bun.S3Client`'s ambient read.** `StorageClientLive` takes
  region/endpoint/credentials through the shared `AwsClientConfig` (same as the queue's SQS client),
  **not** `Bun.S3Client`'s implicit env read, because the client **snapshots ambient creds at process
  start and ignores runtime `process.env` injection** — so the LocalStack harness can only point it at
  the container through the `ConfigProvider` seam. (Decision: an earlier `S3Writer` seam existed only so
  tests could swap an in-memory writer; once tests moved to LocalStack it was a single-impl abstraction
  with no caller, so it was collapsed — deep-modules §1.)

## Testing — `@lexiai/storage/testing`

Real `Bun.S3Client` over a **per-file LocalStack S3 container** — no in-memory fake; copies the
`@lexiai/queue/testing` template (`.claude/rules/testing.md`, "Test AWS services"). `StorageLocalStackLive`
boots a `LocalstackContainer` (`SERVICES=s3`), provisions the bucket, supplies the bound `ImagesStoreLive`
over `StorageClientLive` on the container endpoint, and merges the container into context so the read
helpers work. The base's own multi-bucket contract (driving `put(bucket, …)` with two distinct bucket
names) is pinned separately in `storage-client.test.ts`. Inspect what landed with `bucketObjects` (every
object body-and-all; S3 LIST is unordered ⇒ assert key **sets**) and isolate per-test with `resetBucket`
(run at the **start** of each writing test, like `resetDb`/`drainQueue` — a shared-container hook would
spin a second container). One container per file via `it.layer`.

> Downstream suites that don't write (text stages, fetch_source, provenance) provide the exported
> `UnusedStorage` layer (an `ImagesStore` that dies if `put` is called — it does **not** need the base)
> instead of booting a container; the storage-write-failure cases were dropped as redundant — the
> engine's `failed` mapping is already covered by the image-generation-error case.
