# apps/worker — `@lexiai/app-worker`

SQS consumer (Effect v4). Runs on Bun locally and on AWS Lambda.

- **May import:** `core/*`, `@lexiai/*` packages, `effect`, `@effect/platform-bun`.
- **MUST NOT import:** `apps/web` or another app.
- Entrypoint: `src/main.ts` → `BunRuntime.runMain`. Currently a boot-and-log scaffold.
