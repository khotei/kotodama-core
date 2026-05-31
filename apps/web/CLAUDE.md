# apps/web — `@lexiai/app-web`

React 19 SPA (Vite + Tailwind v4 + React Compiler).

**Only `@lexiai/schemas` and `@lexiai/http` can be imported from internal packages — no exceptions.**
Never import `core/`, `database/`, `repositories/`, or backend-only packages (`ai`, `queue`,
`storage`). Enforced by Biome (`noRestrictedImports`).

- HTTP client comes from `@lexiai/http`; no `axios`/`fetch` wrappers.
- See `@.claude/rules/frontend-rules.md` and `.claude/agent-patterns/effect-schema.md`.
