---
paths:
  - "packages/config/**"
  - "**/main.ts"
  - "**/drizzle.config.ts"
---

# Config & env loading

**Path-scoped rule** (loads under `packages/config/**` and app/CLI entrypoints). All env config goes
through **`@kotodama/config`** — both the env-key registry and the env-file loader; nothing else reads
`.env`.

- **Read keys via the package, never `process.env`.** Import the one `Config` you need
  (`DatabaseUrl`, `ImagesBucket`, …) so unrelated keys needn't resolve; `AppConfig` is the full
  bundle for app entrypoints.
- **`ConfigProviderLive`** loads the **repo-root** `.env` as a **fallback under `process.env`**
  (real/exported vars and Bun's own `.env` auto-load win). There is no test-mode branch: **DB tests
  don't use this layer** — they run against an ephemeral Testcontainers Postgres with a generated
  URL (`@kotodama/database/testing`), so there is no `.env.test` and nothing to protect the dev DB
  from. See `.claude/rules/testing.md`.
- **Env files live at the repo root**, git-ignored (`.env.example` is the template); no per-package
  `.env*`, no `.env.test`. The root is resolved by offset from the package's own file, so `cwd`
  doesn't matter.
- **Provide the layer where Effects run:** apps merge it at the entrypoint; non-Effect CLIs
  (`drizzle.config.ts`) resolve one value via `Effect.runSync` through it — never raw `process.env`
  or hand-rolled dotenv.
