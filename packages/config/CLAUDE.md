# packages/config — `@lexiai/config`

Config values built from `effect/Config` (env vars per Tech spec §2.5). Secrets via `Config.redacted`.

- **May import:** `effect` + Node builtins (`node:fs`/`node:path`/`node:url`, to read the root `.env`). Importable by any backend layer (the single home for env keys).
- **Individual configs** — `DatabaseUrl`, `ImagesBucket`, `JobsQueueUrl`, `OpenaiApiKey`, `AwsRegion`, `AwsEndpoint` (optional `Option<string>` — set to LocalStack's endpoint locally, `None` in prod), `LogLevel`. Import the one you need so you don't require unrelated keys to resolve (e.g. the DB layer takes `DatabaseUrl` alone).
- **`AppConfig`** — the whole bundle (`Config.all`, composed from the individual configs) for app entrypoints. Yield it: `const cfg = yield* AppConfig`.
- **`ConfigProviderLive`** — the env **loader**: a `Layer` that reads the **repo-root** `.env` as a fallback under `process.env`. Provide it at app entrypoints (and non-Effect CLIs like `drizzle.config.ts`) so the configs above resolve from the root `.env`. This is the single source of env loading — see `@.claude/rules/config.md`. (Root is resolved by a fixed offset from the package's own location, so it is cwd-independent — no file searching.) DB tests do **not** use it: they hit an ephemeral Testcontainers Postgres (`@lexiai/database/testing`), so there is no `.env.test`.
