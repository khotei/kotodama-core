# packages/storage — `@lexiai/storage`

`StorageService` over `Bun.S3Client` (a Bun global, no npm dep). **Backend-only.**

- **May import:** `effect`. Uses the `Bun` runtime global for S3.
- **MUST NOT** be imported by `apps/web`.
- Scaffolding only.
