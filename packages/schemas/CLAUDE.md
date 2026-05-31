# packages/schemas — `@lexiai/schemas`

Shared **Effect Schemas** — the domain contract. Consumed by **both** frontend and backend.

- **May import:** `effect` only.
- **MUST NOT import:** anything backend-only (`@aws-sdk/*`, `bun:*`, `@effect/sql-pg`) or any other `@lexiai/*` package. Stay isomorphic so `apps/web` can bundle it.
- Use `effect/Schema` (never Zod). See `.claude/agent-patterns/effect-schema.md`.
