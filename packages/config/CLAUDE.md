# packages/config — `@lexiai/config`

`AppConfig` built from `effect/Config` (env vars per Tech spec §2.5). Secrets via `Config.redacted`.

- **May import:** `effect`. Importable by any backend layer.
- Yield `AppConfig` inside an Effect: `const cfg = yield* AppConfig`.
