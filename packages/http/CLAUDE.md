# packages/http — `@lexiai/http`

Shared **`HttpApi` definition + error tags**. Consumed by frontend and backend.

- **May import:** `effect`, `@lexiai/schemas`.
- **MUST NOT import:** backend-only deps — keep it isomorphic.
- `HttpApi` lives under `effect/unstable/*` during the v4 beta. See `.claude/agent-patterns/effect-httpapi.md`.
