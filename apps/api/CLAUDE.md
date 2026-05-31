# apps/api — `@lexiai/app-api`

HttpApi server (Effect v4). Runs on Bun locally and on AWS Lambda via the Lambda Web Adapter.

- **May import:** `core/*`, `@lexiai/*` packages, `effect`, `@effect/platform-bun`.
- **MUST NOT import:** `apps/web` or another app.
- Entrypoint: `src/main.ts` → `BunRuntime.runMain`. Currently a boot-and-log scaffold.
- Effect/HttpApi patterns: `.claude/agent-patterns/effect-httpapi.md`, `.claude/agent-patterns/effect-context-and-layer.md`.
